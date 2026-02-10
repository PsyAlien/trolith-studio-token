import { readFileSync, writeFileSync } from "node:fs";
import { ethers } from "ethers";

const RPC_URL = "http://127.0.0.1:8545";
const SHOP_ADDRESS = process.env.SHOP;

// Optional: pass SPENDER=0x... to include spend events
const SPENDER_ADDRESS = process.env.SPENDER || null;

if (!SHOP_ADDRESS) {
  console.error("Missing SHOP env var. Example: SHOP=0x... node index.js");
  process.exit(1);
}

const tokenShopArtifact = JSON.parse(
  readFileSync("../out/TokenShop.sol/TokenShop.json", "utf8")
);
const shopAbi = tokenShopArtifact.abi;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const shop = new ethers.Contract(SHOP_ADDRESS, shopAbi, provider);

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
  if (assetLower === ETH_ASSET.toLowerCase()) return Number(ethers.formatEther(amountRaw));
  return Number(ethers.formatUnits(amountRaw, decimals));
}

async function getAssetDecimals(assetLower) {
  if (assetLower === ETH_ASSET.toLowerCase()) return 18;
  try {
    return Number(await shop.assetDecimals(assetLower));
  } catch {
    return 18;
  }
}

function getNested(map, k1, k2, initFn) {
  if (!map.has(k1)) map.set(k1, new Map());
  const inner = map.get(k1);
  if (!inner.has(k2)) inner.set(k2, initFn());
  return inner.get(k2);
}

function csvEscape(v) {
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

// Minimal ABI for GameSpender Spent event (so we don't need artifact)
const gameSpenderAbi = [
  "event Spent(address indexed user, address indexed operator, address indexed treasury, uint256 amount, bytes32 reason)",
];

async function main() {
  const latest = await provider.getBlockNumber();

  // ---------------- Ops config ----------------
  let feeBps = 0n;
  try {
    feeBps = await shop.feeBps();
  } catch {}

  const shopEthBalance = await provider.getBalance(SHOP_ADDRESS);

  // ---------------- ETH pricing ----------------
  let buyRateEth = 0n;
  let sellRateEth = 0n;
  let quoteBuyGen = 0n;
  let quoteSellEth = 0n;

  try {
    buyRateEth = await shop.buyRate(ETH_ASSET);
    sellRateEth = await shop.sellRate(ETH_ASSET);
    quoteBuyGen = await shop.getQuoteBuyETH(ethers.parseEther("0.01"));
    quoteSellEth = await shop.getQuoteSellToETH(ethers.parseUnits("10", 18));
  } catch {}

  // ---------------- TokenShop events ----------------
  const boughtLogs = await shop.queryFilter(shop.filters.Bought(), 0, latest);
  const soldLogs = await shop.queryFilter(shop.filters.Sold(), 0, latest);

  // NEW: OperatorMinted events (Phase 7)
  let opMintLogs = [];
  try {
    // If the event doesn't exist on a deployment, this will throw; we handle gracefully.
    opMintLogs = await shop.queryFilter(shop.filters.OperatorMinted(), 0, latest);
  } catch {
    opMintLogs = [];
  }

  // ---------------- Aggregations ----------------

  // Per-asset aggregate (buy/sell)
  const perAsset = new Map(); // assetLower -> stats
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

  // Per-user-per-asset aggregate
  // userLower -> (assetLower -> stats)
  const perUser = new Map();
  const initUserAsset = () => ({
    buys: 0,
    sells: 0,
    assetIn: 0n,   // asset spent (buys)
    assetOut: 0n,  // asset received (sells)
    genIn: 0n,     // GEN spent (sells)
    genOut: 0n,    // GEN received (buys)

    // Phase 6 (spending)
    spends: 0,
    genSpent: 0n,

    // Phase 7 (operator mint)
    opMints: 0,
    genOpMinted: 0n,
  });

  // ---- Normalize BOUGHT logs across versions ----
  for (const ev of boughtLogs) {
    const args = ev.args ?? {};
    // New version: { user, payAsset, amountIn, genOut }
    // Old version: { buyer, paidWei, genOut }
    const user = args.user ?? args.buyer;
    const asset = args.payAsset ?? ETH_ASSET;
    const amountIn = args.amountIn ?? args.paidWei ?? 0n;
    const genOut = args.genOut ?? 0n;

    const assetLower = asLowerAddr(asset) || ETH_ASSET.toLowerCase();
    const userLower = asLowerAddr(user);

    const a = getAssetStats(assetLower);
    a.buys += 1;
    a.amountIn += amountIn;
    a.genOut += genOut;
    if (userLower) a.usersBuy.add(userLower);

    if (userLower) {
      const u = getNested(perUser, userLower, assetLower, initUserAsset);
      u.buys += 1;
      u.assetIn += amountIn;
      u.genOut += genOut;
    }
  }

  // ---- Normalize SOLD logs across versions ----
  for (const ev of soldLogs) {
    const args = ev.args ?? {};
    // New version: { user, payAsset, genIn, amountOut }
    // Old version: { seller, genIn, paidWei }  (paidWei = ETH out)
    const user = args.user ?? args.seller;
    const asset = args.payAsset ?? ETH_ASSET;
    const genIn = args.genIn ?? 0n;
    const amountOut = args.amountOut ?? args.paidWei ?? 0n;

    const assetLower = asLowerAddr(asset) || ETH_ASSET.toLowerCase();
    const userLower = asLowerAddr(user);

    const a = getAssetStats(assetLower);
    a.sells += 1;
    a.genIn += genIn;
    a.amountOut += amountOut;
    if (userLower) a.usersSell.add(userLower);

    if (userLower) {
      const u = getNested(perUser, userLower, assetLower, initUserAsset);
      u.sells += 1;
      u.genIn += genIn;
      u.assetOut += amountOut;
    }
  }

  // ---------------- Phase 6: Spent events ----------------
  let spendLogs = [];
  const spendGlobal = {
    spends: 0,
    totalGenSpent: 0n,
    uniqueUsers: new Set(),
    uniqueOperators: new Set(),
    uniqueTreasuries: new Set(),
    byReason: new Map(), // reasonHex -> {count, total}
  };

  if (SPENDER_ADDRESS) {
    const spender = new ethers.Contract(SPENDER_ADDRESS, gameSpenderAbi, provider);

    try {
      spendLogs = await spender.queryFilter(spender.filters.Spent(), 0, latest);

      for (const ev of spendLogs) {
        const { user, operator, treasury, amount, reason } = ev.args;

        const userLower = asLowerAddr(user);
        const opLower = asLowerAddr(operator);
        const treLower = asLowerAddr(treasury);
        const reasonHex = String(reason); // bytes32 as 0x...

        spendGlobal.spends += 1;
        spendGlobal.totalGenSpent += amount;
        if (userLower) spendGlobal.uniqueUsers.add(userLower);
        if (opLower) spendGlobal.uniqueOperators.add(opLower);
        if (treLower) spendGlobal.uniqueTreasuries.add(treLower);

        if (!spendGlobal.byReason.has(reasonHex)) {
          spendGlobal.byReason.set(reasonHex, { count: 0, total: 0n });
        }
        const r = spendGlobal.byReason.get(reasonHex);
        r.count += 1;
        r.total += amount;

        // attach to a pseudo-asset row "GEN_SPEND"
        const GEN_SPEND_KEY = "GEN_SPEND";
        if (userLower) {
          const u = getNested(perUser, userLower, GEN_SPEND_KEY, initUserAsset);
          u.spends += 1;
          u.genSpent += amount;
        }
      }
    } catch (e) {
      console.error(
        `Warning: could not read Spent events from SPENDER=${SPENDER_ADDRESS}. ` +
          `Is it deployed on this Anvil run?`
      );
      spendLogs = [];
    }
  }

  // ---------------- Phase 7: OperatorMinted events ----------------
  const opMintGlobal = {
    count: opMintLogs.length,
    totalGen: 0n,
    uniqueRecipients: new Set(),
    byRef: new Map(), // refHex -> {count, totalGen}
  };

  for (const ev of opMintLogs) {
    const args = ev.args ?? {};
    const to = args.to;
    const amount = args.amount ?? 0n;
    const ref = args.ref ?? args[2]; // fallback if named args absent

    const toLower = asLowerAddr(to);
    const refHex = ref ? String(ref) : "0x0";

    opMintGlobal.totalGen += amount;
    if (toLower) opMintGlobal.uniqueRecipients.add(toLower);

    if (!opMintGlobal.byRef.has(refHex)) {
      opMintGlobal.byRef.set(refHex, { count: 0, totalGen: 0n });
    }
    const rr = opMintGlobal.byRef.get(refHex);
    rr.count += 1;
    rr.totalGen += amount;

    // attach to pseudo-asset row "GEN_OPMINT"
    const GEN_OPMINT_KEY = "GEN_OPMINT";
    if (toLower) {
      const u = getNested(perUser, toLower, GEN_OPMINT_KEY, initUserAsset);
      u.opMints += 1;
      u.genOpMinted += amount;
    }
  }

  // ---------------- Print report ----------------
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
  if (opMintGlobal.count === 0) {
    console.log("(No OperatorMinted events found on this deployment)");
  } else {
    console.log("Operator mints:", opMintGlobal.count);
    console.log("Total GEN minted (operator):", fmtGen(opMintGlobal.totalGen));
    console.log("Unique recipients:", opMintGlobal.uniqueRecipients.size);

    if (opMintGlobal.byRef.size > 0) {
      console.log("");
      console.log("By ref (bytes32):");
      const refs = Array.from(opMintGlobal.byRef.entries()).sort((a, b) => {
        if (a[1].totalGen === b[1].totalGen) return b[1].count - a[1].count;
        return b[1].totalGen > a[1].totalGen ? 1 : -1;
      });
      for (const [refHex, v] of refs.slice(0, 10)) {
        console.log(`  ${refHex}  count=${v.count}  totalGen=${fmtGen(v.totalGen)}`);
      }
    }
  }
  console.log("");

  console.log("---- Game Spending (Phase 6) ----");
  if (SPENDER_ADDRESS) {
    console.log("Spender:", SPENDER_ADDRESS);
    console.log("Spends:", spendGlobal.spends);
    console.log("Total GEN spent:", fmtGen(spendGlobal.totalGenSpent));
    console.log("Unique users:", spendGlobal.uniqueUsers.size);
    console.log("Unique operators:", spendGlobal.uniqueOperators.size);
    console.log("Unique treasuries:", spendGlobal.uniqueTreasuries.size);

    if (spendGlobal.byReason.size > 0) {
      console.log("");
      console.log("By reason (bytes32):");
      const reasons = Array.from(spendGlobal.byReason.entries()).sort((a, b) => {
        if (a[1].total === b[1].total) return b[1].count - a[1].count;
        return b[1].total > a[1].total ? 1 : -1;
      });
      for (const [reasonHex, v] of reasons.slice(0, 10)) {
        console.log(`  ${reasonHex}  count=${v.count}  totalGen=${fmtGen(v.total)}`);
      }
    }
    console.log("");
  } else {
    console.log("(No SPENDER provided. Run with: SPENDER=0x... SHOP=0x... node index.js)");
    console.log("");
  }

  console.log("---- Per-User Summary (net positions) ----");
  for (const [userLower, assetsMap] of perUser.entries()) {
    console.log(`User: ${userLower}`);
    for (const [assetLower, u] of assetsMap.entries()) {
      if (assetLower === "GEN_SPEND") {
        console.log("  Asset: GEN (spend)");
        console.log(`    spends=${u.spends}`);
        console.log(`    gen_spent=${fmtGen(u.genSpent)}`);
        continue;
      }

      if (assetLower === "GEN_OPMINT") {
        console.log("  Asset: GEN (operator mint)");
        console.log(`    operator_mints=${u.opMints}`);
        console.log(`    gen_minted=${fmtGen(u.genOpMinted)}`);
        continue;
      }

      const decimals = await getAssetDecimals(assetLower);
      const assetName = assetLower === ETH_ASSET.toLowerCase() ? "ETH" : assetLower;

      const netAsset = u.assetOut - u.assetIn;
      const netGen = u.genOut - u.genIn;

      console.log(`  Asset: ${assetName}`);
      console.log(`    buys=${u.buys}, sells=${u.sells}`);
      console.log(
        `    asset_in=${fmtAssetAmount(assetLower, u.assetIn, decimals)} | asset_out=${fmtAssetAmount(assetLower, u.assetOut, decimals)} | net_asset=${fmtAssetAmount(assetLower, netAsset, decimals)}`
      );
      console.log(
        `    gen_out=${fmtGen(u.genOut)} | gen_in=${fmtGen(u.genIn)} | net_gen=${fmtGen(netGen)}`
      );
    }
    console.log("");
  }

  // ---------------- CSV export ----------------
  const argv = process.argv.slice(2);
  const csvIndex = argv.indexOf("--csv");
  if (csvIndex !== -1) {
    const outPath = argv[csvIndex + 1];
    if (!outPath) {
      console.error("Missing output path. Example: node index.js --csv report.csv");
      process.exit(1);
    }

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
      "spends",
      "gen_spent",
      "operator_mints",
      "gen_minted",
    ]);

    for (const [userLower, assetsMap] of perUser.entries()) {
      for (const [assetLower, u] of assetsMap.entries()) {
        if (assetLower === "GEN_SPEND") {
          rows.push([
            userLower,
            "GEN_SPEND",
            0, 0,
            0, 0, 0,
            0, 0, 0,
            u.spends,
            fmtGen(u.genSpent),
            0,
            0,
          ]);
          continue;
        }

        if (assetLower === "GEN_OPMINT") {
          rows.push([
            userLower,
            "GEN_OPMINT",
            0, 0,
            0, 0, 0,
            0, 0, 0,
            0,
            0,
            u.opMints,
            fmtGen(u.genOpMinted),
          ]);
          continue;
        }

        const decimals = await getAssetDecimals(assetLower);
        const assetName = assetLower === ETH_ASSET.toLowerCase() ? "ETH" : assetLower;

        const netAsset = u.assetOut - u.assetIn;
        const netGen = u.genOut - u.genIn;

        rows.push([
          userLower,
          assetName,
          u.buys,
          u.sells,
          fmtAssetAmount(assetLower, u.assetIn, decimals),
          fmtAssetAmount(assetLower, u.assetOut, decimals),
          fmtAssetAmount(assetLower, netAsset, decimals),
          fmtGen(u.genOut),
          fmtGen(u.genIn),
          fmtGen(netGen),
          u.spends,
          fmtGen(u.genSpent),
          u.opMints,
          fmtGen(u.genOpMinted),
        ]);
      }
    }

    const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
    writeFileSync(outPath, csv, "utf8");
    console.log(`CSV written: ${outPath}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
