import { Router } from "express";
import { getGenTotalSupply } from "../services/shop.js";
import {
  getSummary,
  getPerAsset,
  getRecentActivity,
} from "../services/analytics.js";

const router = Router();

/**
 * GET /api/analytics/summary
 * Returns high-level stats: total buys/sells, GEN minted/burned, unique users.
 */
router.get("/summary", async (_req, res, next) => {
  try {
    const totalSupply = await getGenTotalSupply();
    const summary = await getSummary(totalSupply);
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/analytics/per-asset
 * Returns buy/sell breakdown per payment asset.
 */
router.get("/per-asset", async (_req, res, next) => {
  try {
    const data = await getPerAsset();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/analytics/activity?limit=15
 * Returns recent unified activity feed (newest first).
 */
router.get("/activity", async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 15, 1), 100);
    const activity = await getRecentActivity(limit);
    res.json(activity);
  } catch (err) {
    next(err);
  }
});

export default router;