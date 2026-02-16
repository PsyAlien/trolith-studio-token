import { ethers } from "ethers";
import {
  shop,
  provider,
  SHOP_ADDRESS,
  ERC20_ABI,
  getAssetSymbol,
  getAssetDecimals,
} from "../config.js";

const ETH = ethers.ZeroAddress;

/**
 * Returns current shop configuration from chain.
 */
export async function getShopConfig() {
  const [feeBps, maxEthIn, maxGenIn, paused, tokenAddr] = await Promise.all([
    shop.feeBps().catch(() => 0n),
    shop.maxEthIn().catch(() => 0n),
    shop.maxGenIn().catch(() => 0n),
    shop.paused().catch(() => false),
    shop.token().catch(() => null),
  ]);

  // ETH rates
  const [buyRateEth, sellRateEth] = await Promise.all([
    shop.buyRate(ETH).catch(() => 0n),
    shop.sellRate(ETH).catch(() => 0n),
  ]);

  return {
    shopAddress: SHOP_ADDRESS,
    tokenAddress: tokenAddr,
    paused,
    feeBps: Number(feeBps),
    feePercent: Number(feeBps) / 100,
    maxEthIn: ethers.formatEther(maxEthIn),
    maxGenIn: ethers.formatUnits(maxGenIn, 18),
    rates: {
      eth: {
        buyRate: ethers.formatUnits(buyRateEth, 18),
        sellRate: ethers.formatUnits(sellRateEth, 18),
      },
    },
  };
}

/**
 * Returns shop liquidity — ETH balance + any known ERC-20 balances.
 * Pass in known asset addresses (from DB events) to check their balances.
 */
export async function getShopLiquidity(knownAssets = []) {
  const ethBalance = await provider.getBalance(SHOP_ADDRESS);

  const liquidity = {
    ETH: ethers.formatEther(ethBalance),
  };

  for (const assetLower of knownAssets) {
    if (assetLower === ETH.toLowerCase()) continue;

    const symbol = await getAssetSymbol(assetLower);
    const decimals = await getAssetDecimals(assetLower);

    try {
      const erc20 = new ethers.Contract(assetLower, ERC20_ABI, provider);
      const balance = await erc20.balanceOf(SHOP_ADDRESS);
      liquidity[symbol] = Number(ethers.formatUnits(balance, decimals));
    } catch {
      liquidity[symbol] = null;
    }
  }

  return liquidity;
}

/**
 * Returns the list of supported assets (ETH + known ERC-20s).
 *
 * How it works:
 * - ETH is always included (it's built into the shop)
 * - We look at past events in the DB to find ERC-20 addresses that have been used
 * - For each one, we check if it's still marked as supported in the contract
 * - We return: address, symbol, decimals, buy/sell rates
 *
 * @param knownAssets - array of { address, dbSymbol } from the DB
 *   dbSymbol is the symbol stored when the event was indexed — used as
 *   fallback if the on-chain symbol() call fails (e.g. contract gone)
 */
export async function getSupportedAssets(knownAssets = []) {
  // ETH is always first — it's always supported
  const [ethBuyRate, ethSellRate] = await Promise.all([
    shop.buyRate(ETH).catch(() => 0n),
    shop.sellRate(ETH).catch(() => 0n),
  ]);

  const assets = [
    {
      address: ETH,
      symbol: "ETH",
      decimals: 18,
      buyRate: ethers.formatUnits(ethBuyRate, 18),
      sellRate: ethers.formatUnits(ethSellRate, 18),
    },
  ];

  // Track seen symbols to avoid duplicates (e.g. two USDT deploys)
  const seenSymbols = new Set(["ETH"]);
  // Track seen addresses to avoid duplicates
  const seenAddresses = new Set([ETH.toLowerCase()]);

  // Check each known ERC-20
  for (const { address: addr, dbSymbol } of knownAssets) {
    const lower = addr.toLowerCase();
    if (seenAddresses.has(lower)) continue;
    seenAddresses.add(lower);

    try {
      // Ask the contract: is this token still supported?
      const isSupported = await shop.supportedTokens(lower);
      if (!isSupported) continue;

      // Try on-chain symbol first, fall back to DB symbol
      let symbol;
      try {
        symbol = await getAssetSymbol(lower);
      } catch {
        symbol = dbSymbol || lower; // last resort: use address
      }
      // If getAssetSymbol returned the raw address, prefer dbSymbol
      if (symbol === lower && dbSymbol) {
        symbol = dbSymbol;
      }

      const decimals = await getAssetDecimals(lower);
      const [bRate, sRate] = await Promise.all([
        shop.buyRate(lower).catch(() => 0n),
        shop.sellRate(lower).catch(() => 0n),
      ]);

      // Skip if no rates configured
      if (bRate === 0n && sRate === 0n) continue;

      // Skip duplicate symbols
      if (seenSymbols.has(symbol)) continue;
      seenSymbols.add(symbol);

      assets.push({
        address: lower,
        symbol,
        decimals,
        buyRate: ethers.formatUnits(bRate, 18),
        sellRate: ethers.formatUnits(sRate, 18),
      });
    } catch {
      // skip tokens we can't read
    }
  }

  return assets;
}

/**
 * Returns GEN total supply.
 */
export async function getGenTotalSupply() {
  try {
    const tokenAddr = await shop.token();
    const genToken = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
    const supply = await genToken.totalSupply();
    return ethers.formatUnits(supply, 18);
  } catch {
    return "0";
  }
}

/**
 * Returns GEN balance for a given user address.
 */
export async function getUserBalance(userAddress) {
  try {
    const tokenAddr = await shop.token();
    const genToken = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
    const balance = await genToken.balanceOf(userAddress);
    return ethers.formatUnits(balance, 18);
  } catch {
    return "0";
  }
}