import fs from "fs";
import { ethers } from "ethers";

const SHOP = process.env.SHOP;

if (!SHOP) {
  console.log("Missing SHOP env var.");
  console.log('Example: SHOP=0x... node index.js credit --user 0x... --btc 0.01 --txid tx123');
  console.log("Example: SHOP=0x... node index.js mint-pending");
  console.log("Example: SHOP=0x... node index.js mark-minted tx123");
  console.log("Example: SHOP=0x... node index.js status");
  console.log("Example: SHOP=0x... node index.js status --csv btc_report.csv");
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

const args = process.argv.slice(2);

/*
Commands:
1) credit:
   SHOP=0x... node index.js credit --user 0x... --btc 0.01 --txid tx123

2) mint-pending:
   SHOP=0x... node index.js mint-pending

3) mark-minted:
   SHOP=0x... node index.js mark-minted tx123

4) status:
   SHOP=0x... node index.js status
   SHOP=0x... node index.js status --csv btc_report.csv
*/

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
  const ref = ethers.keccak256(ethers.toUtf8Bytes(txid));

  console.log("\n=== CREDIT RECORDED ===");
  console.log(entry);

  console.log("\nRun this to mint:");
  console.log(`
cast send ${SHOP} "operatorMint(address,uint256,bytes32)" \
${user} ${genWei} ${ref} \
--rpc-url http://127.0.0.1:8545 \
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
    const ref = ethers.keccak256(ethers.toUtf8Bytes(c.txid));

    console.log("User:", c.user);
    console.log("BTC:", c.btc);
    console.log("GEN:", c.gen);
    console.log("TXID:", c.txid);
    console.log("Minted?:", c.minted === true ? "YES" : "NO");
    console.log("\nMint command:\n");

    console.log(`
cast send ${SHOP} "operatorMint(address,uint256,bytes32)" \
${c.user} ${genWei} ${ref} \
--rpc-url http://127.0.0.1:8545 \
--private-key YOUR_OPERATOR_PK
`);
    console.log("--------------------------------------------------\n");
  }
} else if (args[0] === "mark-minted") {
  const txid = args[1];

  if (!txid) {
    console.log("Bad args.");
    console.log("Use: node index.js mark-minted tx123");
    process.exit(1);
  }

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

  console.log("✅ Marked as minted:", txid);
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

  // Per-user
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

  // Print
  console.log("\n==== BTC Bridge Status ====");
  console.log("Shop:", SHOP);
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

  // CSV export
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
  console.log('Use: node index.js credit --user 0x... --btc 0.01 --txid tx123');
  console.log("Use: node index.js mint-pending");
  console.log("Use: node index.js mark-minted tx123");
  console.log("Use: node index.js status");
  console.log("Use: node index.js status --csv btc_report.csv");
  process.exit(1);
}
