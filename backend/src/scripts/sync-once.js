// Run: node src/scripts/sync-once.js
// One-shot sync — useful for cron jobs or manual triggers.

import "../config.js"; // load env
import { syncEvents } from "../services/sync.js";

async function main() {
  console.log("Syncing events from chain...");
  const result = await syncEvents();
  console.log(
    `Done. Synced ${result.synced} new events (blocks ${result.fromBlock} → ${result.toBlock})`
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("Sync failed:", e);
  process.exit(1);
});