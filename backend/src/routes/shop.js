import { Router } from "express";
import prisma from "../db.js";
import { getShopConfig, getShopLiquidity, getGenTotalSupply } from "../services/shop.js";

const router = Router();

/**
 * GET /api/shop/config
 * Returns current on-chain shop configuration.
 */
router.get("/config", async (_req, res, next) => {
  try {
    const config = await getShopConfig();
    const totalSupply = await getGenTotalSupply();
    res.json({ ...config, genTotalSupply: totalSupply });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/shop/liquidity
 * Returns ETH + ERC-20 balances held by the shop.
 */
router.get("/liquidity", async (_req, res, next) => {
  try {
    // Get unique assets from DB events
    const assets = await prisma.event.groupBy({ by: ["asset"] });
    const assetAddresses = assets.map((a) => a.asset);

    const liquidity = await getShopLiquidity(assetAddresses);
    res.json(liquidity);
  } catch (err) {
    next(err);
  }
});

export default router;