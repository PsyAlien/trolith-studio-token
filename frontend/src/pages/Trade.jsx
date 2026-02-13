import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useWallet } from "../context/WalletContext";
import { useContracts } from "../hooks/useContracts";
import { apiGet, triggerSync } from "../hooks/useApi";
import { ArrowDownUp, Zap, AlertTriangle, CheckCircle } from "lucide-react";

export default function Trade() {
  const { isConnected, address } = useWallet();
  const { getShop, getToken, getErc20, shopAddress, ready } = useContracts();

  // Trade mode
  const [mode, setMode] = useState("buy"); // "buy" | "sell"
  const [asset, setAsset] = useState("ETH");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  // TX state
  const [txStatus, setTxStatus] = useState(null); // null | "pending" | "success" | "error"
  const [txMessage, setTxMessage] = useState("");
  const [txHash, setTxHash] = useState(null);

  // Config
  const [config, setConfig] = useState(null);

  useEffect(() => {
    apiGet("/shop/config").then(setConfig).catch(console.error);
  }, []);

  // Debounced quote fetching
  useEffect(() => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setQuote(null);
      return;
    }

    const timer = setTimeout(async () => {
      setQuoteLoading(true);
      try {
        let path;
        if (mode === "buy" && asset === "ETH") {
          path = `/quotes/buy-eth?amount=${amount}`;
        } else if (mode === "sell" && asset === "ETH") {
          path = `/quotes/sell-eth?gen=${amount}`;
        } else if (mode === "buy") {
          path = `/quotes/buy-token?asset=${asset}&amount=${amount}`;
        } else {
          path = `/quotes/sell-token?asset=${asset}&gen=${amount}`;
        }
        const q = await apiGet(path);
        setQuote(q);
      } catch (err) {
        setQuote(null);
        console.error("Quote error:", err);
      } finally {
        setQuoteLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [amount, mode, asset]);

  // Reset status when mode/asset changes
  useEffect(() => {
    setTxStatus(null);
    setTxMessage("");
    setTxHash(null);
    setAmount("");
    setQuote(null);
  }, [mode, asset]);

  async function handleTrade() {
    if (!ready) return;

    setTxStatus("pending");
    setTxMessage("Confirm in wallet...");
    setTxHash(null);

    try {
      const shop = getShop();
      let tx;

      if (mode === "buy" && asset === "ETH") {
        const weiIn = ethers.parseEther(amount);
        tx = await shop.buyETH(0n, { value: weiIn });
      } else if (mode === "sell" && asset === "ETH") {
        const genIn = ethers.parseUnits(amount, 18);
        // Approve first
        const token = getToken();
        setTxMessage("Approving GEN transfer...");
        const approveTx = await token.approve(shopAddress, genIn);
        await approveTx.wait();

        setTxMessage("Confirm sell in wallet...");
        tx = await shop.sellToETH(genIn, 0n);
      } else if (mode === "buy") {
        // ERC-20 buy
        const erc20 = getErc20(asset);
        const decimals = await erc20.decimals();
        const amountIn = ethers.parseUnits(amount, decimals);

        setTxMessage("Approving token transfer...");
        const approveTx = await erc20.approve(shopAddress, amountIn);
        await approveTx.wait();

        setTxMessage("Confirm buy in wallet...");
        tx = await shop.buyToken(asset, amountIn, 0n);
      } else {
        // ERC-20 sell
        const genIn = ethers.parseUnits(amount, 18);
        const token = getToken();

        setTxMessage("Approving GEN transfer...");
        const approveTx = await token.approve(shopAddress, genIn);
        await approveTx.wait();

        setTxMessage("Confirm sell in wallet...");
        tx = await shop.sellToToken(asset, genIn, 0n);
      }

      setTxMessage("Transaction submitted, waiting for confirmation...");
      setTxHash(tx.hash);
      await tx.wait();

      setTxStatus("success");
      setTxMessage("Transaction confirmed!");
      setAmount("");
      setQuote(null);

      // Trigger sync so backend picks it up
      triggerSync().catch(console.error);
    } catch (err) {
      setTxStatus("error");
      const reason = err.reason || err.message || "Transaction failed";
      setTxMessage(reason.length > 100 ? reason.slice(0, 100) + "..." : reason);
      console.error("Trade error:", err);
    }
  }

  const isBuy = mode === "buy";

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold">
          <span className="glow-text-cyan">Trade</span>
        </h1>
        <p className="text-gray-500 text-sm mt-1">Buy or sell GEN tokens</p>
      </div>

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

        {/* Asset Selection */}
        <div className="mb-4">
          <label className="label">
            {isBuy ? "Pay with" : "Receive"}
          </label>
          <select
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
            className="input-field cursor-pointer"
          >
            <option value="ETH">ETH</option>
            {/* Add more assets here as needed */}
          </select>
        </div>

        {/* Amount Input */}
        <div className="mb-4">
          <label className="label">
            {isBuy ? `Amount (${asset === "ETH" ? "ETH" : "Token"})` : "Amount (GEN)"}
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
            {isBuy ? "You receive (GEN)" : `You receive (${asset === "ETH" ? "ETH" : "Token"})`}
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

        {/* Rate Display */}
        {config && asset === "ETH" && (
          <div className="bg-dark-700/50 rounded-lg p-3 mb-6">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Rate</span>
              <span className="font-mono">
                1 ETH = {isBuy ? config.rates?.eth?.buyRate : config.rates?.eth?.sellRate} GEN
              </span>
            </div>
            {config.feePercent > 0 && (
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Fee</span>
                <span className="font-mono">{config.feePercent}%</span>
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
            disabled={!amount || !quote || txStatus === "pending"}
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
              ? `Buy GEN`
              : `Sell GEN`}
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