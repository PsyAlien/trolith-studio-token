// indexer/index.js
// ES module (requires "type":"module" in indexer/package.json)

import { readFileSync, writeFileSync } from "node:fs";
import { ethers } from "ethers";

// --------- Config ---------
const RPC_URL = process.env.RPC || "http://127.0.0.1:8545";
const SHOP_ADDRESS = process.env.SHOP;

if (!SHOP_ADDRESS) {
  console.error("Missing SHOP env var. Usage:");
  console.error("  SHOP=0x... node index.js");
  console.error("  SHOP=0x... node index.js --csv report.csv");
  process.exit(1);
}

// --------- Load ABI ---------
const tokenShopArtifact = JSON.parse(
  readFileSync("../out/TokenShop.sol/TokenShop.json", "utf8")
);
const shopAbi = tokenShopArtifact.abi;

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
];

const provider = new ethers.JsonRpcProvider(RPC_URL);
const shop = new ethers.Contract(SHOP_ADDRESS, shopAbi, provider);

// --------- Helpers ---------
const ETH_ASSET = ethers.ZeroAddress.toLowerCase();

const fmtEth = (wei) => Number(ethers.formatEther(wei));
const fmtGen = (units) => Number(ethers.formatUnits(units, 18));

function asLowerAddr(x) {
  if (!x) return null;
  try {
    return String(x).toLowerCase();
  } catch {
    return null;
  }
}

function fmtAssetAmount(assetLower, amountRaw, decimals) {
  if (assetLower === ETH_ASSET) return fmtEth(amountRaw);
  return Number(ethers.formatUnits(amountRaw, decimals));
}

// ---- Token symbol + decimals cache ----
const _symbolCache = new Map();
const _decCache = new Map();

_symbolCache.set(ETH_ASSET, "ETH");
_decCache.set(ETH_ASSET, 18);

async function getAssetSymbol(assetLower) {
  const key = assetLower || ETH_ASSET;
  if (_symbolCache.has(key)) return _symbolCache.get(key);

  let symbol = key; // fallback to address
  try {
    const erc20 = new ethers.Contract(key, ERC20_ABI, provider);
    symbol = await erc20.symbol();
  } catch {
    // keep address as fallback
  }
  _symbolCache.set(key, symbol);
  return symbol;
}

async function getAssetDecimals(assetLower) {
  const key = assetLower || ETH_ASSET;
  if (_decCache.has(key)) return _decCache.get(key);

  let d = 18;
  try {
    d = Number(await shop.assetDecimals(key));
  } catch {
    try {
      const erc20 = new ethers.Contract(key, ERC20_ABI, provider);
      d = Number(await erc20.decimals());
    } catch {
      d = 18;
    }
  }
  _decCache.set(key, d);
  return d;
}

function parseCsvFlag() {
  const idx = process.argv.indexOf("--csv");
  if (idx === -1) return null;
  const path = process.argv[idx + 1];
  if (!path) {
    console.error("Missing CSV path. Usage: node index.js --csv report.csv");
    process.exit(1);
  }
  return path;
}

function csvEscape(v) {
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

// --------- Aggregation state ---------
const perAsset = new Map();
const perUser = new Map();

function getAssetStats(assetLower) {
  const key = assetLower || ETH_ASSET;
  if (!perAsset.has(key)) {
    perAsset.set(key, {
      buys: 0,
      sells: 0,
      amountIn: 0n,
      amountOut: 0n,
      genOut: 0n,
      genIn: 0n,
      usersBuy: new Set(),
      usersSell: new Set(),
    });
  }
  return perAsset.get(key);
}

function getUserAsset(userLower, assetLower) {
  const key = assetLower || ETH_ASSET;
  if (!perUser.has(userLower)) {
    perUser.set(userLower, new Map());
  }
  const userAssets = perUser.get(userLower);
  if (!userAssets.has(key)) {
    userAssets.set(key, {
      buys: 0,
      sells: 0,
      asset_in: 0n,
      asset_out: 0n,
      gen_out: 0n,
      gen_in: 0n,
    });
  }
  return userAssets.get(key);
}

// --------- Main ---------
async function main() {
  const latest = await provider.getBlockNumber();

  // --- On-chain config snapshot ---
  let feeBps = 0n;
  try { feeBps = await shop.feeBps(); } catch { feeBps = 0n; }

  const shopEthBalance = await provider.getBalance(SHOP_ADDRESS);

  // Resolve the GEN token address + total supply
  let genAddress = null;
  let genTotalSupply = 0n;
  try {
    genAddress = await shop.token();
    const genToken = new ethers.Contract(genAddress, ERC20_ABI, provider);
    genTotalSupply = await genToken.totalSupply();
  } catch {
    // ok
  }

  let buyRateEth = 0n;
  let sellRateEth = 0n;
  try {
    buyRateEth = await shop.buyRate(ethers.ZeroAddress);
    sellRateEth = await shop.sellRate(ethers.ZeroAddress);
  } catch {
    buyRateEth = 0n;
    sellRateEth = 0n;
  }

  let quoteBuyGen = 0n;
  let quoteSellEth = 0n;
  try {
    quoteBuyGen = await shop.getQuoteBuyETH(ethers.parseEther("0.01"));
    quoteSellEth = await shop.getQuoteSellToETH(ethers.parseUnits("10", 18));
  } catch {
    quoteBuyGen = 0n;
    quoteSellEth = 0n;
  }

  // --- Fetch event logs ---
  const boughtLogs = await shop.queryFilter(shop.filters.Bought(), 0, latest);
  const soldLogs = await shop.queryFilter(shop.filters.Sold(), 0, latest);

  // Track all known ERC-20 asset addresses for liquidity reporting
  const knownAssets = new Set();

  // --- Aggregate Bought events ---
  for (const ev of boughtLogs) {
    const args = ev.args ?? {};
    const user = args.user ?? args.buyer;
    const asset = args.payAsset ?? ethers.ZeroAddress;
    const amountIn = args.amountIn ?? args.paidWei ?? 0n;
    const genOut = args.genOut ?? 0n;

    const assetLower = asLowerAddr(asset) || ETH_ASSET;
    const userLower = asLowerAddr(user);
    if (!userLower) continue;

    knownAssets.add(assetLower);

    const s = getAssetStats(assetLower);
    s.buys += 1;
    s.amountIn += amountIn;
    s.genOut += genOut;
    s.usersBuy.add(userLower);

    const ua = getUserAsset(userLower, assetLower);
    ua.buys += 1;
    ua.asset_in += amountIn;
    ua.gen_out += genOut;
  }

  // --- Aggregate Sold events ---
  for (const ev of soldLogs) {
    const args = ev.args ?? {};
    const user = args.user ?? args.seller;
    const asset = args.payAsset ?? ethers.ZeroAddress;
    const genIn = args.genIn ?? 0n;
    const amountOut = args.amountOut ?? args.paidWei ?? 0n;

    const assetLower = asLowerAddr(asset) || ETH_ASSET;
    const userLower = asLowerAddr(user);
    if (!userLower) continue;

    knownAssets.add(assetLower);

    const s = getAssetStats(assetLower);
    s.sells += 1;
    s.amountOut += amountOut;
    s.genIn += genIn;
    s.usersSell.add(userLower);

    const ua = getUserAsset(userLower, assetLower);
    ua.sells += 1;
    ua.asset_out += amountOut;
    ua.gen_in += genIn;
  }

  // ========== Print Report ==========
  console.log("==== TokenShop Analytics ====");
  console.log("RPC:", RPC_URL);
  console.log("Shop:", SHOP_ADDRESS);
  if (genAddress) console.log("GEN token:", genAddress);
  console.log("Blocks: 0 →", latest);
  console.log("");

  // --- Quick Summary ---
  const allBuyers = new Set();
  const allSellers = new Set();
  let totalBuys = 0;
  let totalSells = 0;
  let totalGenMinted = 0n;
  let totalGenBurned = 0n;

  for (const s of perAsset.values()) {
    totalBuys += s.buys;
    totalSells += s.sells;
    totalGenMinted += s.genOut;
    totalGenBurned += s.genIn;
    for (const u of s.usersBuy) allBuyers.add(u);
    for (const u of s.usersSell) allSellers.add(u);
  }

  const allUsers = new Set([...allBuyers, ...allSellers]);

  console.log("---- Summary ----");
  console.log("Total buys:", totalBuys);
  console.log("Total sells:", totalSells);
  console.log("Total GEN minted (via buys):", fmtGen(totalGenMinted), "GEN");
  console.log("Total GEN burned (via sells):", fmtGen(totalGenBurned), "GEN");
  console.log("GEN total supply:", fmtGen(genTotalSupply), "GEN");
  console.log("Unique users:", allUsers.size, `(${allBuyers.size} buyers, ${allSellers.size} sellers)`);
  console.log("");

  // --- Ops Config ---
  console.log("---- Ops Config ----");
  console.log(`Fee: ${feeBps.toString()} bps (${Number(feeBps) / 100}%)`);
  console.log("");

  // --- Shop Liquidity ---
  console.log("---- Shop Liquidity ----");
  console.log("ETH:", fmtEth(shopEthBalance));

  for (const assetLower of knownAssets) {
    if (assetLower === ETH_ASSET) continue;
    const symbol = await getAssetSymbol(assetLower);
    const decimals = await getAssetDecimals(assetLower);
    try {
      const erc20 = new ethers.Contract(assetLower, ERC20_ABI, provider);
      const balance = await erc20.balanceOf(SHOP_ADDRESS);
      console.log(`${symbol}:`, Number(ethers.formatUnits(balance, decimals)));
    } catch {
      console.log(`${symbol}: (unable to read balance)`);
    }
  }
  console.log("");

  // --- ETH Pricing ---
  console.log("---- ETH Pricing ----");
  if (buyRateEth > 0n && sellRateEth > 0n) {
    console.log("Buy rate  (GEN per 1 ETH):", fmtGen(buyRateEth));
    console.log("Sell rate (GEN per 1 ETH):", fmtGen(sellRateEth));
    console.log("Quote: 0.01 ETH → GEN:", fmtGen(quoteBuyGen));
    console.log("Quote: 10 GEN → ETH:", fmtEth(quoteSellEth));
  } else {
    console.log("(rates not available on this deployment)");
  }
  console.log("");

  // --- Per-Asset Summary ---
  console.log("---- Per-Asset Summary ----");
  if (perAsset.size === 0) {
    console.log("(No buy/sell activity found)");
  }
  for (const [assetLower, s] of perAsset.entries()) {
    const decimals = await getAssetDecimals(assetLower);
    const symbol = await getAssetSymbol(assetLower);

    console.log(`Asset: ${symbol}`);
    console.log("  Buys:", s.buys, "| Unique buyers:", s.usersBuy.size);
    console.log("  Sells:", s.sells, "| Unique sellers:", s.usersSell.size);
    console.log("  Total paid in:", fmtAssetAmount(assetLower, s.amountIn, decimals), symbol);
    console.log("  Total GEN out:", fmtGen(s.genOut), "GEN");
    console.log("  Total GEN in:", fmtGen(s.genIn), "GEN");
    console.log("  Total paid out:", fmtAssetAmount(assetLower, s.amountOut, decimals), symbol);
    console.log("");
  }

  // --- Per-User Summary ---
  console.log("---- Per-User Net Positions ----");
  if (perUser.size === 0) {
    console.log("(No users found)");
  }
  for (const [userLower, userAssets] of perUser.entries()) {
    console.log(`User: ${userLower}`);

    for (const [assetLower, a] of userAssets.entries()) {
      const decimals = await getAssetDecimals(assetLower);
      const symbol = await getAssetSymbol(assetLower);

      const netAsset = a.asset_out - a.asset_in;
      const netGen = a.gen_out - a.gen_in;

      console.log(`  ${symbol}:`);
      console.log(`    buys=${a.buys}, sells=${a.sells}`);
      console.log(
        `    paid_in=${fmtAssetAmount(assetLower, a.asset_in, decimals)} | paid_out=${fmtAssetAmount(assetLower, a.asset_out, decimals)} | net=${fmtAssetAmount(assetLower, netAsset, decimals)} ${symbol}`
      );
      console.log(
        `    gen_out=${fmtGen(a.gen_out)} | gen_in=${fmtGen(a.gen_in)} | net=${fmtGen(netGen)} GEN`
      );
    }
    console.log("");
  }

  // --- Recent Activity Feed ---
  const activity = [];

  for (const ev of boughtLogs) {
    const args = ev.args ?? {};
    activity.push({
      type: "BUY",
      block: ev.blockNumber,
      idx: ev.index ?? ev.logIndex ?? 0,
      user: asLowerAddr(args.user ?? args.buyer),
      asset: asLowerAddr(args.payAsset ?? ethers.ZeroAddress) || ETH_ASSET,
      amount: args.amountIn ?? args.paidWei ?? 0n,
      gen: args.genOut ?? 0n,
    });
  }

  for (const ev of soldLogs) {
    const args = ev.args ?? {};
    activity.push({
      type: "SELL",
      block: ev.blockNumber,
      idx: ev.index ?? ev.logIndex ?? 0,
      user: asLowerAddr(args.user ?? args.seller),
      asset: asLowerAddr(args.payAsset ?? ethers.ZeroAddress) || ETH_ASSET,
      amount: args.amountOut ?? args.paidWei ?? 0n,
      gen: args.genIn ?? 0n,
    });
  }

  activity.sort((a, b) => (a.block - b.block) || (a.idx - b.idx));
  const recent = activity.slice(-15);

  console.log("---- Recent Activity (last 15) ----");
  if (recent.length === 0) {
    console.log("(No activity)");
  }
  for (const e of recent) {
    if (!e.user) continue;
    const d = await getAssetDecimals(e.asset);
    const symbol = await getAssetSymbol(e.asset);

    if (e.type === "BUY") {
      console.log(
        `[block ${e.block}] BUY  ${e.user}  paid ${fmtAssetAmount(e.asset, e.amount, d)} ${symbol} → ${fmtGen(e.gen)} GEN`
      );
    } else {
      console.log(
        `[block ${e.block}] SELL ${e.user}  burned ${fmtGen(e.gen)} GEN → ${fmtAssetAmount(e.asset, e.amount, d)} ${symbol}`
      );
    }
  }
  console.log("");

  // --------- CSV Export (optional) ---------
  const csvPath = parseCsvFlag();
  if (csvPath) {
    const rows = [];
    rows.push([
      "user",
      "asset",
      "buys",
      "sells",
      "asset_in",
      "asset_out",
      "net_asset",
      "gen_out",
      "gen_in",
      "net_gen",
    ]);

    for (const [userLower, userAssets] of perUser.entries()) {
      for (const [assetLower, a] of userAssets.entries()) {
        const decimals = await getAssetDecimals(assetLower);
        const symbol = await getAssetSymbol(assetLower);
        const netAsset = a.asset_out - a.asset_in;
        const netGen = a.gen_out - a.gen_in;

        rows.push([
          userLower,
          symbol,
          a.buys,
          a.sells,
          fmtAssetAmount(assetLower, a.asset_in, decimals),
          fmtAssetAmount(assetLower, a.asset_out, decimals),
          fmtAssetAmount(assetLower, netAsset, decimals),
          fmtGen(a.gen_out),
          fmtGen(a.gen_in),
          fmtGen(netGen),
        ]);
      }
    }

    const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
    writeFileSync(csvPath, csv, "utf8");
    console.log(`CSV written: ${csvPath}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});