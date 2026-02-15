import { useWallet } from "../context/WalletContext";
import { useApiData, triggerSync } from "../hooks/useApi";
import StatCard from "../components/StatCard";
import ErrorBanner from "../components/ErrorBanner";
import { Coins, ArrowDownLeft, ArrowUpRight, RefreshCw, Wallet } from "lucide-react";
import { ethers } from "ethers";
import { useState } from "react";

function formatAmount(raw, decimals = 18) {
  try {
    return Number(ethers.formatUnits(raw, decimals)).toFixed(4);
  } catch {
    return raw;
  }
}

function timeAgo(timestamp) {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function Portfolio() {
  const { isConnected, address } = useWallet();
  const [syncing, setSyncing] = useState(false);

  const { data: balance, loading: balLoading, error: balError, refresh: refreshBal } = useApiData(
    isConnected ? `/user/${address}/balance` : null
  );
  const { data: history, loading: histLoading, error: histError, refresh: refreshHist } = useApiData(
    isConnected ? `/user/${address}/history` : null
  );

  const apiError = balError || histError;

  async function handleRefresh() {
    setSyncing(true);
    try {
      await triggerSync();
      await Promise.all([refreshBal(), refreshHist()]);
    } catch (err) {
      console.error(err);
    } finally {
      setSyncing(false);
    }
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="p-6 rounded-full bg-dark-800 border border-dark-600 mb-6">
          <Wallet size={40} className="text-gray-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-300 mb-2">Connect Your Wallet</h2>
        <p className="text-gray-500 text-sm">Connect your wallet to view your portfolio</p>
      </div>
    );
  }

  const positions = history?.positions || [];
  const events = history?.events || [];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">
            <span className="glow-text-purple">Portfolio</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1 font-mono">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={syncing}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Error Banner */}
      <ErrorBanner message={apiError} onRetry={handleRefresh} />

      {/* Balance Card */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="GEN Balance"
          value={balance?.genBalance || "0"}
          sub="Your current balance"
          color="cyan"
          icon={Coins}
        />
        <StatCard
          label="Total Buys"
          value={positions.reduce((s, p) => s + p.buys, 0)}
          color="green"
          icon={ArrowDownLeft}
        />
        <StatCard
          label="Total Sells"
          value={positions.reduce((s, p) => s + p.sells, 0)}
          color="pink"
          icon={ArrowUpRight}
        />
      </div>

      {/* Net Positions */}
      {positions.length > 0 && (
        <div className="card mb-8">
          <p className="label mb-4">Net Positions by Asset</p>
          <div className="space-y-3">
            {positions.map((p) => (
              <div
                key={p.asset}
                className="flex items-center justify-between p-3 bg-dark-700/50 rounded-lg"
              >
                <div>
                  <span className="text-sm font-semibold text-gray-200">{p.symbol}</span>
                  <span className="text-xs text-gray-500 ml-2">
                    {p.buys} buys · {p.sells} sells
                  </span>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-mono font-semibold ${
                    Number(p.netGen) >= 0 ? "text-neon-green" : "text-neon-pink"
                  }`}>
                    {Number(p.netGen) >= 0 ? "+" : ""}{p.netGen} GEN
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transaction History */}
      <div className="card">
        <p className="label mb-4">Transaction History</p>
        {histLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-dark-700 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">No transactions yet</p>
        ) : (
          <div className="space-y-2">
            {events.map((e, i) => {
              const isBuy = e.type === "BUY";
              const assetDecimals = e.assetSymbol === "ETH" ? 18 : 6;

              return (
                <div
                  key={`${e.txHash}-${i}`}
                  className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-dark-700/50 hover:bg-dark-700 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-1.5 rounded-lg ${
                        isBuy ? "bg-neon-green/10" : "bg-neon-pink/10"
                      }`}
                    >
                      {isBuy ? (
                        <ArrowDownLeft size={14} className="text-neon-green" />
                      ) : (
                        <ArrowUpRight size={14} className="text-neon-pink" />
                      )}
                    </div>
                    <div>
                      <span className={isBuy ? "badge-buy" : "badge-sell"}>{e.type}</span>
                      <span className="text-xs text-gray-500 ml-2">
                        Block {e.block}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    {isBuy ? (
                      <p className="text-sm font-mono">
                        <span className="text-gray-400">
                          {formatAmount(e.amountIn, assetDecimals)} {e.assetSymbol}
                        </span>
                        <span className="text-gray-600 mx-1.5">→</span>
                        <span className="text-neon-green">
                          {formatAmount(e.amountOut, 18)} GEN
                        </span>
                      </p>
                    ) : (
                      <p className="text-sm font-mono">
                        <span className="text-gray-400">
                          {formatAmount(e.amountIn, 18)} GEN
                        </span>
                        <span className="text-gray-600 mx-1.5">→</span>
                        <span className="text-neon-pink">
                          {formatAmount(e.amountOut, assetDecimals)} {e.assetSymbol}
                        </span>
                      </p>
                    )}
                    <p className="text-xs text-gray-600 mt-0.5">{timeAgo(e.timestamp)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}