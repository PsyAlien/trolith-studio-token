import express from "express";
import cors from "cors";
import morgan from "morgan";

import { PORT, SYNC_INTERVAL } from "./config.js";
import { syncEvents } from "./services/sync.js";

import shopRoutes from "./routes/shop.js";
import quotesRoutes from "./routes/quotes.js";
import userRoutes from "./routes/user.js";
import analyticsRoutes from "./routes/analytics.js";
import adminRoutes from "./routes/admin.js";

const app = express();

// ---- Middleware ----
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// ---- Routes ----
app.use("/api/shop", shopRoutes);
app.use("/api/quotes", quotesRoutes);
app.use("/api/user", userRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/admin", adminRoutes);

// Manual sync trigger
app.post("/api/sync", async (_req, res, next) => {
  try {
    const result = await syncEvents();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ---- Error handler ----
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: err.message,
  });
});

// ---- Start ----
app.listen(PORT, () => {
  console.log(`Trolith Studio Backend running on http://localhost:${PORT}`);
  console.log("");
  console.log("Endpoints:");
  console.log("  GET  /api/health");
  console.log("  GET  /api/shop/config");
  console.log("  GET  /api/shop/liquidity");
  console.log("  GET  /api/quotes/buy-eth?amount=0.01");
  console.log("  GET  /api/quotes/sell-eth?gen=10");
  console.log("  GET  /api/quotes/buy-token?asset=0x...&amount=10");
  console.log("  GET  /api/quotes/sell-token?asset=0x...&gen=20");
  console.log("  GET  /api/user/:address/balance");
  console.log("  GET  /api/user/:address/history");
  console.log("  GET  /api/analytics/summary");
  console.log("  GET  /api/analytics/per-asset");
  console.log("  GET  /api/analytics/activity?limit=15");
  console.log("  POST /api/sync");
  console.log("  POST /api/admin/set-rates");
  console.log("  POST /api/admin/set-fee");
  console.log("  POST /api/admin/pause");
  console.log("  POST /api/admin/unpause");
  console.log("  POST /api/admin/set-limits");
  console.log("  POST /api/admin/withdraw-eth");
  console.log("  POST /api/admin/set-supported-token");
  console.log("  POST /api/admin/set-asset-decimals");
  console.log("");
});

// ---- Auto-sync loop (optional) ----
if (SYNC_INTERVAL > 0) {
  console.log(`Auto-sync enabled: every ${SYNC_INTERVAL}s`);

  // Initial sync on startup
  syncEvents()
    .then((r) => console.log(`Initial sync: ${r.synced} events (blocks ${r.fromBlock}→${r.toBlock})`))
    .catch((e) => console.error("Initial sync failed:", e.message));

  // Periodic sync
  setInterval(async () => {
    try {
      const r = await syncEvents();
      if (r.synced > 0) {
        console.log(`Sync: ${r.synced} new events (blocks ${r.fromBlock}→${r.toBlock})`);
      }
    } catch (e) {
      console.error("Sync error:", e.message);
    }
  }, SYNC_INTERVAL * 1000);
}