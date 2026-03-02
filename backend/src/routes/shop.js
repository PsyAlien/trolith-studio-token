import { Router } from "express";
import prisma from "../db.js";
import { getShopConfig, getShopLiquidity, getGenTotalSupply, getSupportedAssets } from "../services/shop.js";

const router = Router();

/**
 * GET /api/shop/supported-assets
 * Returns the list of tradeable assets (ETH + any configured ERC-20s).
 * The frontend uses this to build the asset dropdown dynamically.
 */
router.get("/supported-assets", async (_req, res, next) => {
  try {
    // Find all unique asset addresses + their symbols from past events
    // The DB stores the symbol at index-time, so we can use it as fallback
    // if the on-chain symbol() call fails
    const events = await prisma.event.groupBy({ by: ["asset", "assetSymbol"] });
    const knownAssets = events.map((e) => ({
      address: e.asset,
      dbSymbol: e.assetSymbol,
    }));

    const assets = await getSupportedAssets(knownAssets);
    res.json(assets);
  } catch (err) {
    next(err);
  }
});

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