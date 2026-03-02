import { Router } from "express";
import { ethers } from "ethers";
import { getUserBalance } from "../services/shop.js";
import { getUserHistory } from "../services/analytics.js";

const router = Router();

/**
 * GET /api/user/:address/balance
 * Returns on-chain GEN balance for an address.
 */
router.get("/:address/balance", async (req, res, next) => {
  try {
    const { address } = req.params;
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: "Invalid Ethereum address" });
    }

    const balance = await getUserBalance(address);

    res.json({
      user: address.toLowerCase(),
      genBalance: balance,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/user/:address/history
 * Returns buy/sell history + net positions from DB.
 */
router.get("/:address/history", async (req, res, next) => {
  try {
    const { address } = req.params;
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: "Invalid Ethereum address" });
    }

    const history = await getUserHistory(address);
    res.json(history);
  } catch (err) {
    next(err);
  }
});

export default router;