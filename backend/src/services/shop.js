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