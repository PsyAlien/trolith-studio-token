import { Router } from "express";
import { ethers } from "ethers";
import { shop, SHOP_ADDRESS } from "../config.js";
import { requireAdmin } from "../middleware/adminAuth.js";

const router = Router();

// All admin routes require API key
router.use(requireAdmin);

/**
 * Helper: encodes a contract function call and returns unsigned tx data.
 * The admin signs and broadcasts this from their wallet/frontend.
 */
function unsignedTx(functionName, args) {
  const data = shop.interface.encodeFunctionData(functionName, args);
  return {
    to: SHOP_ADDRESS,
    data,
    description: `Call ${functionName}(${args.map(String).join(", ")})`,
  };
}

/**
 * POST /api/admin/set-rates
 * Body: { asset: "0x...", buyRate: "2000000000000000000000", sellRate: "1000000000000000000000" }
 * Rates are raw uint256 strings (scaled by 1e18).
 */
router.post("/set-rates", (req, res) => {
  try {
    const { asset, buyRate, sellRate } = req.body;

    if (!asset || !ethers.isAddress(asset)) {
      return res.status(400).json({ error: "Invalid asset address" });
    }
    if (!buyRate || !sellRate) {
      return res.status(400).json({ error: "buyRate and sellRate are required (raw uint256 strings)" });
    }

    const tx = unsignedTx("setRates", [asset, BigInt(buyRate), BigInt(sellRate)]);
    res.json({ tx });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/admin/set-fee
 * Body: { feeBps: 100 }  (100 bps = 1%)
 */
router.post("/set-fee", (req, res) => {
  try {
    const { feeBps } = req.body;

    if (feeBps === undefined || feeBps < 0 || feeBps > 1000) {
      return res.status(400).json({ error: "feeBps must be 0–1000 (0%–10%)" });
    }

    const tx = unsignedTx("setFeeBps", [BigInt(feeBps)]);
    res.json({ tx });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/admin/pause
 */
router.post("/pause", (_req, res) => {
  try {
    const tx = unsignedTx("setPaused", [true]);
    res.json({ tx });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/admin/unpause
 */
router.post("/unpause", (_req, res) => {
  try {
    const tx = unsignedTx("setPaused", [false]);
    res.json({ tx });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/admin/set-limits
 * Body: { maxEthIn: "50000000000000000", maxGenIn: "50000000000000000000" }
 * Raw uint256 strings (wei / GEN units).
 */
router.post("/set-limits", (req, res) => {
  try {
    const { maxEthIn, maxGenIn } = req.body;
    const txs = [];

    if (maxEthIn !== undefined) {
      txs.push({
        ...unsignedTx("setMaxEthIn", [BigInt(maxEthIn)]),
        label: "setMaxEthIn",
      });
    }
    if (maxGenIn !== undefined) {
      txs.push({
        ...unsignedTx("setMaxGenIn", [BigInt(maxGenIn)]),
        label: "setMaxGenIn",
      });
    }

    if (txs.length === 0) {
      return res.status(400).json({ error: "Provide maxEthIn and/or maxGenIn" });
    }

    res.json({ txs });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/admin/withdraw-eth
 * Body: { to: "0x...", amountWei: "1000000000000000000" }
 */
router.post("/withdraw-eth", (req, res) => {
  try {
    const { to, amountWei } = req.body;

    if (!to || !ethers.isAddress(to)) {
      return res.status(400).json({ error: "Invalid to address" });
    }
    if (!amountWei) {
      return res.status(400).json({ error: "amountWei is required" });
    }

    const tx = unsignedTx("withdrawETH", [to, BigInt(amountWei)]);
    res.json({ tx });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/admin/set-supported-token
 * Body: { asset: "0x...", supported: true }
 */
router.post("/set-supported-token", (req, res) => {
  try {
    const { asset, supported } = req.body;

    if (!asset || !ethers.isAddress(asset)) {
      return res.status(400).json({ error: "Invalid asset address" });
    }
    if (typeof supported !== "boolean") {
      return res.status(400).json({ error: "supported must be true or false" });
    }

    const tx = unsignedTx("setSupportedToken", [asset, supported]);
    res.json({ tx });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/admin/set-asset-decimals
 * Body: { asset: "0x...", decimals: 6 }
 */
router.post("/set-asset-decimals", (req, res) => {
  try {
    const { asset, decimals } = req.body;

    if (!asset || !ethers.isAddress(asset)) {
      return res.status(400).json({ error: "Invalid asset address" });
    }
    if (decimals === undefined || decimals < 0 || decimals > 18) {
      return res.status(400).json({ error: "decimals must be 0–18" });
    }

    const tx = unsignedTx("setAssetDecimals", [asset, decimals]);
    res.json({ tx });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;