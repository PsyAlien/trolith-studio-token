import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useWallet } from "../context/WalletContext";
import { apiGet } from "./useApi";

const SHOP_ABI = [
  "function buyETH(uint256 minGenOut) payable",
  "function buyToken(address asset, uint256 amountIn, uint256 minGenOut)",
  "function sellToETH(uint256 genIn, uint256 minEthOut)",
  "function sellToToken(address asset, uint256 genIn, uint256 minTokenOut)",
  "function token() view returns (address)",
  "function setPaused(bool) external",
  "function setFeeBps(uint256) external",
  "function setRates(address, uint256, uint256) external",
  "function setMaxEthIn(uint256) external",
  "function setMaxGenIn(uint256) external",
  "function withdrawETH(address, uint256) external",
  "function setSupportedToken(address, bool) external",
  "function setAssetDecimals(address, uint8) external",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

/**
 * Hook that provides contract instances connected to the user's signer.
 */
export function useContracts() {
  const { signer, provider, isConnected } = useWallet();
  const [shopAddress, setShopAddress] = useState(null);
  const [tokenAddress, setTokenAddress] = useState(null);

  // Fetch shop address from backend config
  useEffect(() => {
    apiGet("/shop/config")
      .then((config) => {
        setShopAddress(config.shopAddress);
        setTokenAddress(config.tokenAddress);
      })
      .catch(console.error);
  }, []);

  function getShop() {
    if (!signer || !shopAddress) return null;
    return new ethers.Contract(shopAddress, SHOP_ABI, signer);
  }

  function getToken() {
    if (!signer || !tokenAddress) return null;
    return new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  }

  function getErc20(address) {
    if (!signer) return null;
    return new ethers.Contract(address, ERC20_ABI, signer);
  }

  function getReadOnlyShop() {
    if (!provider || !shopAddress) return null;
    return new ethers.Contract(shopAddress, SHOP_ABI, provider);
  }

  return {
    shopAddress,
    tokenAddress,
    getShop,
    getToken,
    getErc20,
    getReadOnlyShop,
    ready: isConnected && !!shopAddress,
  };
}