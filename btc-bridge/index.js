import fs from "fs";
import { ethers } from "ethers";

const SHOP = process.env.SHOP;
const RPC_URL = process.env.RPC || "http://127.0.0.1:8545";

if (!SHOP) {
  console.log("Missing SHOP env var.");
  console.log("Examples:");
  console.log('  SHOP=0x... node index.js credit --user 0x... --btc 0.01 --txid tx123');
  console.log("  SHOP=0x... node index.js mint-pending");
  console.log("  SHOP=0x... node index.js mark-minted tx123");
  console.log("  SHOP=0x... node index.js verify-mint tx123");
  console.log("  SHOP=0x... node index.js verify-and-mark tx123");
  console.log("  SHOP=0x... node index.js status --csv btc_report.csv");
  process.exit(1);
}

const LEDGER = "./ledger.json";

/*
Demo rate:
1 BTC = 1,000,000 GEN
So 0.01 BTC => 10,000 GEN
*/
const GEN_PER_BTC = 1_000_000;

function loadLedger() {
  return JSON.parse(fs.readFileSync(LEDGER, "utf8"));
}

function saveLedger(l) {
  fs.writeFileSync(LEDGER, JSON.stringify(l, null, 2));
}

function csvEscape(v) {
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

function requireTxid(txid) {
  if (!txid) {
    console.log("Bad args. Use: node index.js <command> tx123");
    process.exit(1);
  }
}

function refFromTxid(txid) {
  return ethers.keccak256(ethers.toUtf8Bytes(txid));
}

// Minimal ABI: we only need the event to verify mint happened
const SHOP_VERIFY_ABI = [
  "event OperatorMinted(address indexed to, uint256 amount, bytes32 indexed ref)"
];

async function verifyMintOnChain(txid, expectedUserLower, expectedGenNumber) {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const shop = new ethers.Contract(SHOP, SHOP_VERIFY_ABI, provider);

  const ref = refFromTxid(txid);

  // Search for OperatorMinted events with this ref across all blocks.
  // For Anvil / local chains, this is fast enough.
  const logs = await shop.queryFilter(shop.filters.OperatorMinted(null, null, ref), 0, "latest");

  if (!logs || logs.length === 0) {
    return { ok: false, reason: "No OperatorMinted event found for this txid/ref." };
  }

  // Take the first match (there should only be one in a correct system)
  const ev = logs[0];
  const toLower = String(ev.args.to).toLowerCase();
  const amountWei = ev.args.amount; // uint256
  const amountGen = Number(ethers.formatUnits(amountWei, 18));

  // Basic safety checks vs ledger (prevents marking wrong tx/user/amount)
  if (expectedUserLower && toLower !== expectedUserLower) {
    return { ok: false, reason: `Mint was to ${toLower}, but ledger expects ${expectedUserLower}.` };
  }
  if (typeof expectedGenNumber === "number" && Number.isFinite(expectedGenNumber)) {
    // allow tiny float noise by rounding to 6 decimals (your ledger uses simple numbers)
    const round = (x) => Math.round(x * 1e6) / 1e6;
    if (round(amountGen) !== round(expectedGenNumber)) {
      return { ok: false, reason: `Minted GEN=${amountGen}, but ledger expects GEN=${expectedGenNumber}.` };
    }
  }

  return {
    ok: true,
    to: toLower,
    amountGen,
    ref,
    blockNumber: ev.blockNumber,
    txHash: ev.transactionHash,
  };
}

const args = process.argv.slice(2);

if (args[0] === "credit") {
  const user = args[2];
  const btc = Number(args[4]);
  const txid = args[6];

  if (!user || Number.isNaN(btc) || !txid) {
    console.log("Bad args.");
    console.log('Use: node index.js credit --user 0x... --btc 0.01 --txid tx123');
    process.exit(1);
  }

  const ledger = loadLedger();

  // replay protection
  const exists = ledger.credits.find((c) => c.txid === txid);
  if (exists) {
    console.log("\nDeposit already credited:");
    console.log(exists);
    process.exit(0);
  }

  const genAmount = btc * GEN_PER_BTC;

  const entry = {
    user,
    btc,
    txid,
    gen: genAmount,
    timestamp: Date.now(),
    minted: false,
  };

  ledger.credits.push(entry);
  saveLedger(ledger);

  const genWei = ethers.parseUnits(genAmount.toString(), 18);
  const ref = refFromTxid(txid);

  console.log("\n=== CREDIT RECORDED ===");
  console.log(entry);

  console.log("\nRun this to mint:");
  console.log(`
cast send ${SHOP} "operatorMint(address,uint256,bytes32)" \
${user} ${genWei} ${ref} \
--rpc-url ${RPC_URL} \
--private-key YOUR_OPERATOR_PK
`);
} else if (args[0] === "mint-pending") {
  const ledger = loadLedger();
  const pending = ledger.credits.filter((c) => c.minted !== true);

  if (pending.length === 0) {
    console.log("\nNo pending mints 🎉");
    process.exit(0);
  }

  console.log("\n=== PENDING MINTS ===\n");

  for (const c of pending) {
    const genWei = ethers.parseUnits(c.gen.toString(), 18);
    const ref = refFromTxid(c.txid);

    console.log("User:", c.user);
    console.log("BTC:", c.btc);
    console.log("GEN:", c.gen);
    console.log("TXID:", c.txid);
    console.log("Minted?:", c.minted === true ? "YES" : "NO");
    console.log("\nMint command:\n");

    console.log(`
cast send ${SHOP} "operatorMint(address,uint256,bytes32)" \
${c.user} ${genWei} ${ref} \
--rpc-url ${RPC_URL} \
--private-key YOUR_OPERATOR_PK
`);
    console.log("--------------------------------------------------\n");
  }
} else if (args[0] === "verify-mint") {
  const txid = args[1];
  requireTxid(txid);

  const ledger = loadLedger();
  const entry = ledger.credits.find((c) => c.txid === txid);

  if (!entry) {
    console.log("No ledger entry for txid:", txid);
    process.exit(1);
  }

  const expectedUserLower = String(entry.user).toLowerCase();
  const expectedGen = Number(entry.gen);

  const res = await verifyMintOnChain(txid, expectedUserLower, expectedGen);

  if (!res.ok) {
    console.log("❌ Not verified:", res.reason);
    process.exit(1);
  }

  console.log("✅ Verified on-chain mint!");
  console.log("  to:", res.to);
  console.log("  amountGen:", res.amountGen);
  console.log("  ref:", res.ref);
  console.log("  block:", res.blockNumber);
  console.log("  tx:", res.txHash);
} else if (args[0] === "verify-and-mark") {
  const txid = args[1];
  requireTxid(txid);

  const ledger = loadLedger();
  const entry = ledger.credits.find((c) => c.txid === txid);

  if (!entry) {
    console.log("No deposit found with txid:", txid);
    process.exit(1);
  }

  if (entry.minted === true) {
    console.log("Already marked minted:", txid);
    process.exit(0);
  }

  const expectedUserLower = String(entry.user).toLowerCase();
  const expectedGen = Number(entry.gen);

  const res = await verifyMintOnChain(txid, expectedUserLower, expectedGen);

  if (!res.ok) {
    console.log("❌ Not verified, so NOT marking minted:", res.reason);
    process.exit(1);
  }

  entry.minted = true;
  entry.mintedAt = Date.now();
  entry.mintTxHash = res.txHash;
  entry.mintBlock = res.blockNumber;

  saveLedger(ledger);

  console.log("✅ Verified AND marked minted:", txid);
} else if (args[0] === "mark-minted") {
  const txid = args[1];
  requireTxid(txid);

  const ledger = loadLedger();
  const entry = ledger.credits.find((c) => c.txid === txid);

  if (!entry) {
    console.log("No deposit found with txid:", txid);
    process.exit(1);
  }

  if (entry.minted === true) {
    console.log("Already marked minted:", txid);
    process.exit(0);
  }

  entry.minted = true;
  entry.mintedAt = Date.now();
  saveLedger(ledger);

  console.log("✅ Marked as minted (manual):", txid);
} else if (args[0] === "status") {
  const ledger = loadLedger();
  const credits = ledger.credits || [];

  const minted = credits.filter((c) => c.minted === true);
  const pending = credits.filter((c) => c.minted !== true);

  const sum = (arr, key) => arr.reduce((a, c) => a + (Number(c[key]) || 0), 0);

  const totals = {
    credits: credits.length,
    minted: minted.length,
    pending: pending.length,
    btc_total: sum(credits, "btc"),
    btc_minted: sum(minted, "btc"),
    btc_pending: sum(pending, "btc"),
    gen_total: sum(credits, "gen"),
    gen_minted: sum(minted, "gen"),
    gen_pending: sum(pending, "gen"),
  };

  const byUser = new Map();
  for (const c of credits) {
    const user = String(c.user || "").toLowerCase();
    if (!user) continue;

    if (!byUser.has(user)) {
      byUser.set(user, {
        credits: 0,
        minted: 0,
        pending: 0,
        btc_total: 0,
        btc_minted: 0,
        btc_pending: 0,
        gen_total: 0,
        gen_minted: 0,
        gen_pending: 0,
      });
    }

    const u = byUser.get(user);
    const btc = Number(c.btc) || 0;
    const gen = Number(c.gen) || 0;

    u.credits += 1;
    u.btc_total += btc;
    u.gen_total += gen;

    if (c.minted === true) {
      u.minted += 1;
      u.btc_minted += btc;
      u.gen_minted += gen;
    } else {
      u.pending += 1;
      u.btc_pending += btc;
      u.gen_pending += gen;
    }
  }

  console.log("\n==== BTC Bridge Status ====");
  console.log("Shop:", SHOP);
  console.log("RPC:", RPC_URL);
  console.log("");

  console.log("---- Totals ----");
  console.log("Credits:", totals.credits, "| Minted:", totals.minted, "| Pending:", totals.pending);
  console.log("BTC total:", totals.btc_total, "| minted:", totals.btc_minted, "| pending:", totals.btc_pending);
  console.log("GEN total:", totals.gen_total, "| minted:", totals.gen_minted, "| pending:", totals.gen_pending);
  console.log("");

  console.log("---- Per-user ----");
  if (byUser.size === 0) {
    console.log("(no entries yet)");
  } else {
    for (const [user, u] of byUser.entries()) {
      console.log(`User: ${user}`);
      console.log(`  credits=${u.credits} (minted=${u.minted}, pending=${u.pending})`);
      console.log(`  BTC total=${u.btc_total} | minted=${u.btc_minted} | pending=${u.btc_pending}`);
      console.log(`  GEN total=${u.gen_total} | minted=${u.gen_minted} | pending=${u.gen_pending}`);
      console.log("");
    }
  }

  const csvFlag = args.indexOf("--csv");
  if (csvFlag !== -1) {
    const outPath = args[csvFlag + 1];
    if (!outPath) {
      console.log("Missing CSV path. Example: node index.js status --csv btc_report.csv");
      process.exit(1);
    }

    const rows = [];
    rows.push([
      "user",
      "credits",
      "minted",
      "pending",
      "btc_total",
      "btc_minted",
      "btc_pending",
      "gen_total",
      "gen_minted",
      "gen_pending",
    ]);

    for (const [user, u] of byUser.entries()) {
      rows.push([
        user,
        u.credits,
        u.minted,
        u.pending,
        u.btc_total,
        u.btc_minted,
        u.btc_pending,
        u.gen_total,
        u.gen_minted,
        u.gen_pending,
      ]);
    }

    const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
    fs.writeFileSync(outPath, csv, "utf8");
    console.log(`CSV written: ${outPath}`);
  }
} else {
  console.log("Unknown command.");
  process.exit(1);
}
