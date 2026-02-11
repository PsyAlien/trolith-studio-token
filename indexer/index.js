// indexer/index.js
// ES module (requires "type":"module" in indexer/package.json)

import { readFileSync, writeFileSync } from "node:fs";
import { ethers } from "ethers";

const RPC_URL = process.env.RPC || "http://127.0.0.1:8545";
const SHOP_ADDRESS = process.env.SHOP;
const SPENDER_ADDRESS = process.env.SPENDER || null;

if (!SHOP_ADDRESS) {
  console.error("Missing SHOP env var. Example:");
  console.error("  SHOP=0x... node index.js");
  console.error("Optional:");
  console.error("  SPENDER=0x... (to include Spent events)");
  console.error("  node index.js --csv report.csv");
  process.exit(1);
}

// --------- Load ABIs ---------
const tokenShopArtifact = JSON.parse(
  readFileSync("../out/TokenShop.sol/TokenShop.json", "utf8")
);
const shopAbi = tokenShopArtifact.abi;

// GameSpender is optional
let spenderAbi = null;
try {
  const spenderArtifact = JSON.parse(
    readFileSync("../out/GameSpender.sol/GameSpender.json", "utf8")
  );
  spenderAbi = spenderArtifact.abi;
} catch {
  // ok (user might not have GameSpender build artifact in this repo)
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const shop = new ethers.Contract(SHOP_ADDRESS, shopAbi, provider);
const spender =
  SPENDER_ADDRESS && spenderAbi
    ? new ethers.Contract(SPENDER_ADDRESS, spenderAbi, provider)
    : null;

// --------- Helpers ---------
const ETH_ASSET = ethers.ZeroAddress;

const fmtEth = (wei) => Number(ethers.formatEther(wei));
const fmtGen = (genUnits) => Number(ethers.formatUnits(genUnits, 18));

function asLowerAddr(x) {
  if (!x) return null;
  try {
    return String(x).toLowerCase();
  } catch {
    return null;
  }
}

function fmtAssetAmount(assetLower, amountRaw, decimals) {
  if (assetLower === ETH_ASSET.toLowerCase()) return fmtEth(amountRaw);
  return Number(ethers.formatUnits(amountRaw, decimals));
}

// Cache decimals lookups so we don’t call the chain a lot
const _decCache = new Map();
async function getAssetDecimals(assetLower) {
  const key = assetLower || ETH_ASSET.toLowerCase();
  if (_decCache.has(key)) return _decCache.get(key);

  if (key === ETH_ASSET.toLowerCase()) {
    _decCache.set(key, 18);
    return 18;
  }

  let d = 18;
  try {
    // TokenShop stores decimals in mapping assetDecimals(asset) -> uint8
    d = Number(await shop.assetDecimals(key));
  } catch {
    d = 18;
  }
  _decCache.set(key, d);
  return d;
}

function parseCsvFlag() {
  const idx = process.argv.indexOf("--csv");
  if (idx === -1) return null;
  const path = process.argv[idx + 1];
  if (!path) {
    console.error("Missing CSV path. Example: node index.js --csv report.csv");
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

// --------- Main ---------
async function main() {
  const latest = await provider.getBlockNumber();

  // Ops config (exists in newer versions)
  let feeBps = 0n;
  try {
    feeBps = await shop.feeBps();
  } catch {
    feeBps = 0n;
  }

  const shopEthBalance = await provider.getBalance(SHOP_ADDRESS);

  // ETH rates (Phase 2+)
  let buyRateEth = 0n;
  let sellRateEth = 0n;
  try {
    buyRateEth = await shop.buyRate(ETH_ASSET);
    sellRateEth = await shop.sellRate(ETH_ASSET);
  } catch {
    buyRateEth = 0n;
    sellRateEth = 0n;
  }

  // Quotes (gross)
  let quoteBuyGen = 0n;
  let quoteSellEth = 0n;
  try {
    quoteBuyGen = await shop.getQuoteBuyETH(ethers.parseEther("0.01"));
    quoteSellEth = await shop.getQuoteSellToETH(
      ethers.parseUnits("10", 18)
    );
  } catch {
    quoteBuyGen = 0n;
    quoteSellEth = 0n;
  }

  // --------- Fetch logs ---------
  const boughtLogs = await shop.queryFilter(shop.filters.Bought(), 0, latest);
  const soldLogs = await shop.queryFilter(shop.filters.Sold(), 0, latest);

  // Operator mints (Phase 7) — optional (older deployments might not have it)
  let opMintLogs = [];
  try {
    opMintLogs = await shop.queryFilter(
      shop.filters.OperatorMinted?.() ?? "OperatorMinted",
      0,
      latest
    );
  } catch {
    opMintLogs = [];
  }

  // Spent events (Phase 6) — optional
  let spendLogs = [];
  if (spender) {
    try {
      spendLogs = await spender.queryFilter(spender.filters.Spent(), 0, latest);
    } catch {
      spendLogs = [];
    }
  }

  // --------- Aggregate per-asset + per-user ---------
  const perAsset = new Map(); // assetLower -> stats
  const perUser = new Map(); // userLower -> { assets: Map(assetLower -> stats), spendGen }

  const getAssetStats = (assetLower) => {
    const key = assetLower || ETH_ASSET.toLowerCase();
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
  };

  const getUser = (userLower) => {
    if (!perUser.has(userLower)) {
      perUser.set(userLower, {
        assets: new Map(), // assetLower -> { buys,sells,asset_in,asset_out,gen_out,gen_in }
        spendGen: 0n,
        spendCount: 0,
        opMintGen: 0n,
        opMintCount: 0,
      });
    }
    return perUser.get(userLower);
  };

  const getUserAsset = (userLower, assetLower) => {
    const u = getUser(userLower);
    const key = assetLower || ETH_ASSET.toLowerCase();
    if (!u.assets.has(key)) {
      u.assets.set(key, {
        buys: 0,
        sells: 0,
        asset_in: 0n,
        asset_out: 0n,
        gen_out: 0n,
        gen_in: 0n,
      });
    }
    return u.assets.get(key);
  };

  // ---- Normalize BOUGHT logs across versions ----
  for (const ev of boughtLogs) {
    const args = ev.args ?? {};

    // New: user, payAsset, amountIn, genOut
    // Old: buyer, paidWei, genOut
    const user = args.user ?? args.buyer;
    const asset = args.payAsset ?? ETH_ASSET;
    const amountIn = args.amountIn ?? args.paidWei ?? 0n;
    const genOut = args.genOut ?? 0n;

    const assetLower = asLowerAddr(asset) || ETH_ASSET.toLowerCase();
    const userLower = asLowerAddr(user);
    if (!userLower) continue;

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

  // ---- Normalize SOLD logs across versions ----
  for (const ev of soldLogs) {
    const args = ev.args ?? {};

    // New: user, payAsset, genIn, amountOut
    // Old: seller, genIn, paidWei (ETH out)
    const user = args.user ?? args.seller;
    const asset = args.payAsset ?? ETH_ASSET;
    const genIn = args.genIn ?? 0n;
    const amountOut = args.amountOut ?? args.paidWei ?? 0n;

    const assetLower = asLowerAddr(asset) || ETH_ASSET.toLowerCase();
    const userLower = asLowerAddr(user);
    if (!userLower) continue;

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

  // ---- Operator mint logs (Phase 7) ----
  // Expect: OperatorMinted(address to, uint256 amount, bytes32 ref)
  const opMintByRef = new Map(); // refHex -> {count, gen}
  const opMintUsers = new Set();

  for (const ev of opMintLogs) {
    const args = ev.args ?? {};
    const to = args.to ?? args[0];
    const amount = args.amount ?? args[1] ?? 0n;
    const ref = args.ref ?? args[2];

    const userLower = asLowerAddr(to);
    if (userLower) {
      opMintUsers.add(userLower);
      const u = getUser(userLower);
      u.opMintCount += 1;
      u.opMintGen += amount;
    }

    const refKey = String(ref);
    if (!opMintByRef.has(refKey)) opMintByRef.set(refKey, { count: 0, gen: 0n });
    const r = opMintByRef.get(refKey);
    r.count += 1;
    r.gen += amount;
  }

  // ---- Spend logs (Phase 6) ----
  // Expect in your GameSpender: Spent(operator, user, treasury, amount, reason)
  const spendByReason = new Map(); // bytes32 -> {count, gen}
  const spendUsers = new Set();
  const spendOperators = new Set();
  const spendTreasuries = new Set();

  for (const ev of spendLogs) {
    const args = ev.args ?? {};
    const operator = args.operator ?? args[0];
    const user = args.user ?? args[1];
    const treasury = args.treasury ?? args[2];
    const amount = args.amount ?? args[3] ?? 0n;
    const reason = args.reason ?? args[4];

    const userLower = asLowerAddr(user);
    const opLower = asLowerAddr(operator);
    const trLower = asLowerAddr(treasury);

    if (userLower) {
      spendUsers.add(userLower);
      const u = getUser(userLower);
      u.spendCount += 1;
      u.spendGen += amount;
    }
    if (opLower) spendOperators.add(opLower);
    if (trLower) spendTreasuries.add(trLower);

    const k = String(reason);
    if (!spendByReason.has(k)) spendByReason.set(k, { count: 0, gen: 0n });
    const rr = spendByReason.get(k);
    rr.count += 1;
    rr.gen += amount;
  }

  // --------- Print report ---------
  console.log("==== TokenShop Analytics (Multi-Asset) ====");
  console.log("RPC:", RPC_URL);
  console.log("Shop:", SHOP_ADDRESS);
  console.log("Blocks: 0 →", latest);
  console.log("");

  console.log("---- Ops Config ----");
  console.log("feeBps:", feeBps.toString(), `(=${Number(feeBps) / 100}% )`);
  console.log("Shop ETH treasury balance:", fmtEth(shopEthBalance));
  console.log("");

  console.log("---- ETH Pricing ----");
  if (buyRateEth > 0n && sellRateEth > 0n) {
    console.log("ETH buyRate  (GEN per 1 ETH):", fmtGen(buyRateEth));
    console.log("ETH sellRate (GEN per 1 ETH):", fmtGen(sellRateEth));
    console.log("Quote gross: 0.01 ETH -> GEN:", fmtGen(quoteBuyGen));
    console.log("Quote gross: 10 GEN  -> ETH:", fmtEth(quoteSellEth));
  } else {
    console.log("(rates not available on this deployment)");
  }
  console.log("");

  console.log("---- Per-Asset Summary ----");
  for (const [assetLower, s] of perAsset.entries()) {
    const decimals = await getAssetDecimals(assetLower);
    const name = assetLower === ETH_ASSET.toLowerCase() ? "ETH" : assetLower;

    console.log(`Asset: ${name}`);
    console.log("  Buys:", s.buys, "| Unique buyers:", s.usersBuy.size);
    console.log("  Sells:", s.sells, "| Unique sellers:", s.usersSell.size);
    console.log("  Total amountIn:", fmtAssetAmount(assetLower, s.amountIn, decimals));
    console.log("  Total GEN out:", fmtGen(s.genOut));
    console.log("  Total GEN in:", fmtGen(s.genIn));
    console.log("  Total amountOut:", fmtAssetAmount(assetLower, s.amountOut, decimals));
    console.log("");
  }

  console.log("---- Operator Mint (Phase 7) ----");
  if (opMintLogs.length === 0) {
    console.log("(No OperatorMinted events found on this deployment)");
  } else {
    const totalGen = [...opMintByRef.values()].reduce((a, x) => a + x.gen, 0n);
    console.log("Mints:", opMintLogs.length);
    console.log("Total GEN minted:", fmtGen(totalGen));
    console.log("Unique users:", opMintUsers.size);
    console.log("");
    console.log("By ref (bytes32):");
    for (const [ref, x] of opMintByRef.entries()) {
      console.log(`  ${ref}  count=${x.count}  totalGen=${fmtGen(x.gen)}`);
    }
  }
  console.log("");

  console.log("---- Game Spending (Phase 6) ----");
  if (!SPENDER_ADDRESS) {
    console.log("(No SPENDER env var provided)");
  } else if (!spender) {
    console.log("(SPENDER provided, but GameSpender ABI not found in ../out)");
  } else {
    console.log("Spender:", SPENDER_ADDRESS);
    if (spendLogs.length === 0) {
      console.log("(No Spent events found on this deployment)");
    } else {
      const totalSpent = [...spendByReason.values()].reduce((a, x) => a + x.gen, 0n);
      console.log("Spends:", spendLogs.length);
      console.log("Total GEN spent:", fmtGen(totalSpent));
      console.log("Unique users:", spendUsers.size);
      console.log("Unique operators:", spendOperators.size);
      console.log("Unique treasuries:", spendTreasuries.size);
      console.log("");
      console.log("By reason (bytes32):");
      for (const [reason, x] of spendByReason.entries()) {
        console.log(`  ${reason}  count=${x.count}  totalGen=${fmtGen(x.gen)}`);
      }
    }
  }
  console.log("");

  console.log("---- Per-User Summary (net positions) ----");
  for (const [userLower, u] of perUser.entries()) {
    console.log(`User: ${userLower}`);

    // Assets (ETH/USDT/etc)
    for (const [assetLower, a] of u.assets.entries()) {
      const decimals = await getAssetDecimals(assetLower);
      const name = assetLower === ETH_ASSET.toLowerCase() ? "ETH" : assetLower;

      const netAsset = a.asset_out - a.asset_in; // positive means user net received asset
      const netGen = a.gen_out - a.gen_in;       // positive means user net received GEN

      console.log(`  Asset: ${name}`);
      console.log(`    buys=${a.buys}, sells=${a.sells}`);
      console.log(
        `    asset_in=${fmtAssetAmount(assetLower, a.asset_in, decimals)} | asset_out=${fmtAssetAmount(assetLower, a.asset_out, decimals)} | net_asset=${fmtAssetAmount(assetLower, netAsset, decimals)}`
      );
      console.log(
        `    gen_out=${fmtGen(a.gen_out)} | gen_in=${fmtGen(a.gen_in)} | net_gen=${fmtGen(netGen)}`
      );
    }

    // Operator mint
    if (u.opMintCount > 0) {
      console.log(`  GEN (operator mint)`);
      console.log(`    mints=${u.opMintCount}`);
      console.log(`    gen_minted=${fmtGen(u.opMintGen)}`);
    }

    // Spend
    if (u.spendCount > 0) {
      console.log(`  GEN (spend)`);
      console.log(`    spends=${u.spendCount}`);
      console.log(`    gen_spent=${fmtGen(u.spendGen)}`);
    }

    console.log("");
  }

  // --------- Unified Recent Activity Feed ---------
  const activity = [];

  // BUY
  for (const ev of boughtLogs) {
    const args = ev.args ?? {};
    const user = args.user ?? args.buyer;
    const asset = args.payAsset ?? ETH_ASSET;
    const amountIn = args.amountIn ?? args.paidWei ?? 0n;
    const genOut = args.genOut ?? 0n;

    activity.push({
      type: "BUY",
      block: ev.blockNumber,
      idx: ev.index ?? ev.logIndex ?? 0,
      user: asLowerAddr(user),
      asset: asLowerAddr(asset) || ETH_ASSET.toLowerCase(),
      amount: amountIn,
      gen: genOut,
    });
  }

  // SELL
  for (const ev of soldLogs) {
    const args = ev.args ?? {};
    const user = args.user ?? args.seller;
    const asset = args.payAsset ?? ETH_ASSET;
    const genIn = args.genIn ?? 0n;
    const amountOut = args.amountOut ?? args.paidWei ?? 0n;

    activity.push({
      type: "SELL",
      block: ev.blockNumber,
      idx: ev.index ?? ev.logIndex ?? 0,
      user: asLowerAddr(user),
      asset: asLowerAddr(asset) || ETH_ASSET.toLowerCase(),
      amount: amountOut,
      gen: genIn,
    });
  }

  // OP_MINT
  for (const ev of opMintLogs ?? []) {
    const args = ev.args ?? {};
    const to = args.to ?? args[0];
    const amount = args.amount ?? args[1] ?? 0n;
    const ref = args.ref ?? args[2];

    activity.push({
      type: "OP_MINT",
      block: ev.blockNumber,
      idx: ev.index ?? ev.logIndex ?? 0,
      user: asLowerAddr(to),
      asset: "gen",
      amount: 0n,
      gen: amount,
      ref: String(ref),
    });
  }

  // SPEND
  for (const ev of spendLogs ?? []) {
    const args = ev.args ?? {};
    const user = args.user ?? args[1];
    const amount = args.amount ?? args[3] ?? 0n;
    const reason = args.reason ?? args[4];

    activity.push({
      type: "SPEND",
      block: ev.blockNumber,
      idx: ev.index ?? ev.logIndex ?? 0,
      user: asLowerAddr(user),
      asset: "gen",
      amount: 0n,
      gen: amount,
      reason: String(reason),
    });
  }

  activity.sort((a, b) => (a.block - b.block) || (a.idx - b.idx));
  const last = activity.slice(-15);

  console.log("---- Recent Activity (Unified, last 15) ----");
  for (const e of last) {
    if (!e.user) continue;

    if (e.type === "BUY") {
      const d = await getAssetDecimals(e.asset);
      const name = e.asset === ETH_ASSET.toLowerCase() ? "ETH" : e.asset;
      console.log(
        `[${e.block}] BUY   user=${e.user} paid=${name} amountIn=${fmtAssetAmount(
          e.asset,
          e.amount,
          d
        )} genOut=${fmtGen(e.gen)}`
      );
    } else if (e.type === "SELL") {
      const d = await getAssetDecimals(e.asset);
      const name = e.asset === ETH_ASSET.toLowerCase() ? "ETH" : e.asset;
      console.log(
        `[${e.block}] SELL  user=${e.user} got=${name} amountOut=${fmtAssetAmount(
          e.asset,
          e.amount,
          d
        )} genIn=${fmtGen(e.gen)}`
      );
    } else if (e.type === "OP_MINT") {
      console.log(
        `[${e.block}] MINT  user=${e.user} gen=${fmtGen(e.gen)} ref=${e.ref}`
      );
    } else if (e.type === "SPEND") {
      console.log(
        `[${e.block}] SPEND user=${e.user} gen=${fmtGen(e.gen)} reason=${e.reason}`
      );
    }
  }
  console.log("");

  // --------- CSV export (optional) ---------
  const csvPath = parseCsvFlag();
  if (csvPath) {
    // CSV with per-user view + totals (simple demo-grade export)
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
      "operator_mints",
      "gen_minted",
      "spends",
      "gen_spent",
    ]);

    for (const [userLower, u] of perUser.entries()) {
      // asset rows
      for (const [assetLower, a] of u.assets.entries()) {
        const decimals = await getAssetDecimals(assetLower);
        const name = assetLower === ETH_ASSET.toLowerCase() ? "ETH" : assetLower;

        const netAsset = a.asset_out - a.asset_in;
        const netGen = a.gen_out - a.gen_in;

        rows.push([
          userLower,
          name,
          a.buys,
          a.sells,
          fmtAssetAmount(assetLower, a.asset_in, decimals),
          fmtAssetAmount(assetLower, a.asset_out, decimals),
          fmtAssetAmount(assetLower, netAsset, decimals),
          fmtGen(a.gen_out),
          fmtGen(a.gen_in),
          fmtGen(netGen),
          u.opMintCount,
          fmtGen(u.opMintGen),
          u.spendCount,
          fmtGen(u.spendGen),
        ]);
      }

      // also include rows for users that only have mint/spend (no asset buys/sells)
      if (u.assets.size === 0) {
        rows.push([
          userLower,
          "(none)",
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          u.opMintCount,
          fmtGen(u.opMintGen),
          u.spendCount,
          fmtGen(u.spendGen),
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
