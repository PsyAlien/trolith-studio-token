import { Router } from "express";
import { ethers } from "ethers";
import { shop, getAssetDecimals, getAssetSymbol } from "../config.js";

const router = Router();

/**
 * GET /api/quotes/buy-eth?amount=0.01
 * Returns gross GEN out for a given ETH amount.
 */
router.get("/buy-eth", async (req, res, next) => {
  try {
    const { amount } = req.query;
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ error: "Invalid amount — provide a positive ETH value" });
    }

    const weiIn = ethers.parseEther(amount);
    const genOut = await shop.getQuoteBuyETH(weiIn);

    res.json({
      asset: "ETH",
      amountIn: amount,
      genOut: ethers.formatUnits(genOut, 18),
      note: "Gross quote (before fees)",
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/quotes/sell-eth?gen=10
 * Returns gross ETH out for a given GEN amount.
 */
router.get("/sell-eth", async (req, res, next) => {
  try {
    const { gen } = req.query;
    if (!gen || isNaN(Number(gen)) || Number(gen) <= 0) {
      return res.status(400).json({ error: "Invalid gen — provide a positive GEN value" });
    }

    const genIn = ethers.parseUnits(gen, 18);
    const ethOut = await shop.getQuoteSellToETH(genIn);

    res.json({
      asset: "ETH",
      genIn: gen,
      amountOut: ethers.formatEther(ethOut),
      note: "Gross quote (before fees)",
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/quotes/buy-token?asset=0x...&amount=10
 * Returns gross GEN out for a given ERC-20 amount.
 */
router.get("/buy-token", async (req, res, next) => {
  try {
    const { asset, amount } = req.query;
    if (!asset || !ethers.isAddress(asset)) {
      return res.status(400).json({ error: "Invalid asset address" });
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const assetLower = asset.toLowerCase();
    const decimals = await getAssetDecimals(assetLower);
    const symbol = await getAssetSymbol(assetLower);

    const amountIn = ethers.parseUnits(amount, decimals);
    const genOut = await shop.getQuoteBuyToken(asset, amountIn);

    res.json({
      asset: assetLower,
      symbol,
      amountIn: amount,
      genOut: ethers.formatUnits(genOut, 18),
      note: "Gross quote (before fees)",
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/quotes/sell-token?asset=0x...&gen=20
 * Returns gross ERC-20 out for a given GEN amount.
 */
router.get("/sell-token", async (req, res, next) => {
  try {
    const { asset, gen } = req.query;
    if (!asset || !ethers.isAddress(asset)) {
      return res.status(400).json({ error: "Invalid asset address" });
    }
    if (!gen || isNaN(Number(gen)) || Number(gen) <= 0) {
      return res.status(400).json({ error: "Invalid gen amount" });
    }

    const assetLower = asset.toLowerCase();
    const decimals = await getAssetDecimals(assetLower);
    const symbol = await getAssetSymbol(assetLower);

    const genIn = ethers.parseUnits(gen, 18);
    const tokenOut = await shop.getQuoteSellToToken(asset, genIn);

    res.json({
      asset: assetLower,
      symbol,
      genIn: gen,
      amountOut: ethers.formatUnits(tokenOut, decimals),
      note: "Gross quote (before fees)",
    });
  } catch (err) {
    next(err);
  }
});

export default router;