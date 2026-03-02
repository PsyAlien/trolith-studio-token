import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useWallet } from "../context/WalletContext";
import { useContracts } from "../hooks/useContracts";
import { useApiData, apiGet, triggerSync } from "../hooks/useApi";
import ErrorBanner from "../components/ErrorBanner";
import { ArrowDownUp, Zap, AlertTriangle, CheckCircle, RefreshCw } from "lucide-react";

/**
 * The ETH "zero address" — this is how the contract represents ETH
 * (since ETH isn't an ERC-20 token, it uses address(0) as a placeholder)
 */
const ETH_ADDRESS = "0x0000000000000000000000000000000000000000";

export default function Trade() {
  const { isConnected, address } = useWallet();
  const { getShop, getToken, getErc20, shopAddress, ready } = useContracts();

  // ---------------------------------------------------------------
  // STEP 1: Fetch supported assets from the backend
  // ---------------------------------------------------------------
  // This replaces the old hardcoded "ETH only" dropdown.
  // The backend reads which tokens the shop supports and returns:
  //   [ { address, symbol, decimals, buyRate, sellRate }, ... ]
  //
  // ETH is always first in the list.
  const {
    data: supportedAssets,
    loading: assetsLoading,
    error: assetsError,
    refresh: refreshAssets,
  } = useApiData("/shop/supported-assets");

  // ---------------------------------------------------------------
  // STEP 2: Track which asset is selected
  // ---------------------------------------------------------------
  // Instead of storing just "ETH" as a string, we store the full
  // asset object so we have access to address, symbol, and decimals.
  // We start with null and set it once the list loads.
  const [selectedAsset, setSelectedAsset] = useState(null);

  // When the asset list loads, default to ETH (first item)
  useEffect(() => {
    if (supportedAssets && supportedAssets.length > 0 && !selectedAsset) {
      setSelectedAsset(supportedAssets[0]);
    }
  }, [supportedAssets, selectedAsset]);

  // Trade mode
  const [mode, setMode] = useState("buy"); // "buy" | "sell"
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  // TX state
  const [txStatus, setTxStatus] = useState(null); // null | "pending" | "success" | "error"
  const [txMessage, setTxMessage] = useState("");
  const [txHash, setTxHash] = useState(null);

  // Config (for fee display)
  const [config, setConfig] = useState(null);

  useEffect(() => {
    apiGet("/shop/config").then(setConfig).catch(console.error);
  }, []);

  // ---------------------------------------------------------------
  // STEP 3: Fetch quotes using the selected asset
  // ---------------------------------------------------------------
  // The quote URL changes depending on whether the asset is ETH or
  // an ERC-20 token. We use the asset's ADDRESS to tell the backend
  // which token we mean.
  useEffect(() => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0 || !selectedAsset) {
      setQuote(null);
      return;
    }

    const timer = setTimeout(async () => {
      setQuoteLoading(true);
      try {
        const isEth = selectedAsset.address === ETH_ADDRESS;
        let path;

        if (mode === "buy" && isEth) {
          // "I want to pay X ETH, how much GEN do I get?"
          path = `/quotes/buy-eth?amount=${amount}`;
        } else if (mode === "sell" && isEth) {
          // "I want to sell X GEN, how much ETH do I get?"
          path = `/quotes/sell-eth?gen=${amount}`;
        } else if (mode === "buy") {
          // "I want to pay X USDT, how much GEN do I get?"
          path = `/quotes/buy-token?asset=${selectedAsset.address}&amount=${amount}`;
        } else {
          // "I want to sell X GEN, how much USDT do I get?"
          path = `/quotes/sell-token?asset=${selectedAsset.address}&gen=${amount}`;
        }

        const q = await apiGet(path);
        setQuote(q);
      } catch (err) {
        setQuote(null);
        console.error("Quote error:", err);
      } finally {
        setQuoteLoading(false);
      }
    }, 400); // 400ms debounce — waits for user to stop typing

    return () => clearTimeout(timer);
  }, [amount, mode, selectedAsset]);

  // Reset when mode or asset changes
  useEffect(() => {
    setTxStatus(null);
    setTxMessage("");
    setTxHash(null);
    setAmount("");
    setQuote(null);
  }, [mode, selectedAsset]);

  // ---------------------------------------------------------------
  // STEP 4: Execute trade using the selected asset
  // ---------------------------------------------------------------
  // The trade logic branches on whether we're using ETH or an ERC-20.
  // For ERC-20 buys, we need an approve step first (telling the token
  // contract "the shop is allowed to take X tokens from my wallet").
  async function handleTrade() {
    if (!ready || !selectedAsset) return;

    setTxStatus("pending");
    setTxMessage("Confirm in wallet...");
    setTxHash(null);

    try {
      const shop = getShop();
      const isEth = selectedAsset.address === ETH_ADDRESS;
      let tx;

      if (mode === "buy" && isEth) {
        // --- Buy GEN with ETH ---
        // Convert human amount (like "0.01") to wei (like 10000000000000000)
        const weiIn = ethers.parseEther(amount);
        tx = await shop.buyETH(0n, { value: weiIn });

      } else if (mode === "sell" && isEth) {
        // --- Sell GEN for ETH ---
        const genIn = ethers.parseUnits(amount, 18);

        // Approve: "Hey GEN token, let the shop take X GEN from me"
        const token = getToken();
        setTxMessage("Approving GEN transfer...");
        const approveTx = await token.approve(shopAddress, genIn);
        await approveTx.wait();

        setTxMessage("Confirm sell in wallet...");
        tx = await shop.sellToETH(genIn, 0n);

      } else if (mode === "buy") {
        // --- Buy GEN with ERC-20 (e.g. USDT) ---
        const erc20 = getErc20(selectedAsset.address);

        // Use the asset's decimals (USDT = 6, not 18!)
        const amountIn = ethers.parseUnits(amount, selectedAsset.decimals);

        // Approve: "Hey USDT token, let the shop take X USDT from me"
        setTxMessage(`Approving ${selectedAsset.symbol} transfer...`);
        const approveTx = await erc20.approve(shopAddress, amountIn);
        await approveTx.wait();

        setTxMessage("Confirm buy in wallet...");
        tx = await shop.buyToken(selectedAsset.address, amountIn, 0n);

      } else {
        // --- Sell GEN for ERC-20 ---
        const genIn = ethers.parseUnits(amount, 18);
        const token = getToken();

        setTxMessage("Approving GEN transfer...");
        const approveTx = await token.approve(shopAddress, genIn);
        await approveTx.wait();

        setTxMessage("Confirm sell in wallet...");
        tx = await shop.sellToToken(selectedAsset.address, genIn, 0n);
      }

      setTxMessage("Transaction submitted, waiting for confirmation...");
      setTxHash(tx.hash);
      await tx.wait();

      setTxStatus("success");
      setTxMessage("Transaction confirmed!");
      setAmount("");
      setQuote(null);

      // Sync backend (index new event), then refresh asset data
      try {
        await triggerSync();
        refreshAssets();
        // Re-fetch config too (supply may have changed)
        apiGet("/shop/config").then(setConfig).catch(console.error);
      } catch {
        // sync failed silently — not critical
      }
    } catch (err) {
      setTxStatus("error");
      const reason = err.reason || err.message || "Transaction failed";
      setTxMessage(reason.length > 100 ? reason.slice(0, 100) + "..." : reason);
      console.error("Trade error:", err);
    }
  }

  const isBuy = mode === "buy";
  const isEth = selectedAsset?.address === ETH_ADDRESS;

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold">
          <span className="glow-text-cyan">Trade</span>
        </h1>
        <p className="text-gray-500 text-sm mt-1">Buy or sell GEN tokens</p>
      </div>

      {/* Error Banner — shows if asset loading failed */}
      <ErrorBanner message={assetsError} onRetry={refreshAssets} />

      {/* Trade Card */}
      <div className="card border-dark-500">
        {/* Mode Toggle */}
        <div className="flex rounded-lg bg-dark-700 p-1 mb-6">
          <button
            onClick={() => setMode("buy")}
            className={`flex-1 py-2.5 rounded-md text-sm font-semibold transition-all ${
              isBuy
                ? "bg-neon-green/10 text-neon-green shadow-neon-green border border-neon-green/20"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Buy GEN
          </button>
          <button
            onClick={() => setMode("sell")}
            className={`flex-1 py-2.5 rounded-md text-sm font-semibold transition-all ${
              !isBuy
                ? "bg-neon-pink/10 text-neon-pink shadow-neon-pink border border-neon-pink/20"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Sell GEN
          </button>
        </div>

        {/* -------------------------------------------------------
            ASSET SELECTION — the dynamic dropdown!
            
            Old code:  <option value="ETH">ETH</option>  (hardcoded)
            
            New code:  we .map() over supportedAssets and create 
                       one <option> per asset automatically.
            ------------------------------------------------------- */}
        <div className="mb-4">
          <label className="label">
            {isBuy ? "Pay with" : "Receive"}
          </label>

          {assetsLoading ? (
            /* Show a loading skeleton while fetching */
            <div className="input-field bg-dark-700 animate-pulse h-11 rounded-lg" />
          ) : (
            <select
              value={selectedAsset?.address || ""}
              onChange={(e) => {
                // Find the full asset object that matches the selected address
                const picked = supportedAssets?.find((a) => a.address === e.target.value);
                if (picked) setSelectedAsset(picked);
              }}
              className="input-field cursor-pointer"
            >
              {supportedAssets?.map((asset) => (
                <option key={asset.address} value={asset.address}>
                  {asset.symbol}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Amount Input */}
        <div className="mb-4">
          <label className="label">
            {isBuy
              ? `Amount (${selectedAsset?.symbol || "..."})`
              : "Amount (GEN)"}
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="input-field text-lg"
            step="any"
            min="0"
          />
        </div>

        {/* Arrow Divider */}
        <div className="flex justify-center my-2">
          <div className="p-2 rounded-full bg-dark-700 border border-dark-500">
            <ArrowDownUp size={16} className="text-gray-400" />
          </div>
        </div>

        {/* Quote Display */}
        <div className="mb-6">
          <label className="label">
            {isBuy
              ? "You receive (GEN)"
              : `You receive (${selectedAsset?.symbol || "..."})`}
          </label>
          <div className="input-field bg-dark-900 text-lg flex items-center justify-between">
            {quoteLoading ? (
              <span className="text-gray-500 animate-pulse">Fetching quote...</span>
            ) : quote ? (
              <span className={isBuy ? "glow-text-green" : "glow-text-pink"}>
                {isBuy ? quote.genOut : quote.amountOut}
              </span>
            ) : (
              <span className="text-gray-600">—</span>
            )}
          </div>
          {quote?.note && (
            <p className="text-xs text-gray-600 mt-1">{quote.note}</p>
          )}
        </div>

        {/* Rate Display — now works for any asset, not just ETH */}
        {selectedAsset && (
          <div className="bg-dark-700/50 rounded-lg p-3 mb-6">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Rate</span>
              <span className="font-mono">
                1 {selectedAsset.symbol} = {isBuy ? selectedAsset.buyRate : selectedAsset.sellRate} GEN
              </span>
            </div>
            {config && config.feePercent > 0 && (
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Fee</span>
                <span className="font-mono">{config.feePercent}%</span>
              </div>
            )}
            {!isEth && (
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Decimals</span>
                <span className="font-mono">{selectedAsset.decimals}</span>
              </div>
            )}
          </div>
        )}

        {/* Action Button */}
        {!isConnected ? (
          <p className="text-center text-gray-500 text-sm py-3">
            Connect your wallet to trade
          </p>
        ) : (
          <button
            onClick={handleTrade}
            disabled={!amount || !quote || txStatus === "pending" || !selectedAsset}
            className={`w-full py-3.5 rounded-lg font-bold text-sm transition-all duration-200 ${
              isBuy
                ? "bg-gradient-to-r from-neon-green/80 to-neon-cyan/80 text-dark-900 hover:opacity-90 shadow-neon-green disabled:opacity-30"
                : "bg-gradient-to-r from-neon-pink/80 to-neon-purple/80 text-white hover:opacity-90 shadow-neon-pink disabled:opacity-30"
            }`}
          >
            <Zap size={14} className="inline mr-1" />
            {txStatus === "pending"
              ? "Processing..."
              : isBuy
              ? `Buy GEN with ${selectedAsset?.symbol || "..."}`
              : `Sell GEN for ${selectedAsset?.symbol || "..."}`}
          </button>
        )}

        {/* TX Status */}
        {txStatus && (
          <div
            className={`mt-4 p-3 rounded-lg border text-sm ${
              txStatus === "success"
                ? "bg-neon-green/5 border-neon-green/20 text-neon-green"
                : txStatus === "error"
                ? "bg-neon-pink/5 border-neon-pink/20 text-neon-pink"
                : "bg-neon-cyan/5 border-neon-cyan/20 text-neon-cyan"
            }`}
          >
            <div className="flex items-center gap-2">
              {txStatus === "success" ? (
                <CheckCircle size={14} />
              ) : txStatus === "error" ? (
                <AlertTriangle size={14} />
              ) : (
                <div className="w-3.5 h-3.5 border-2 border-neon-cyan border-t-transparent rounded-full animate-spin" />
              )}
              <span>{txMessage}</span>
            </div>
            {txHash && (
              <p className="font-mono text-xs text-gray-500 mt-1 truncate">
                tx: {txHash}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}