import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { ethers } from "ethers";

function formatAmount(raw, decimals = 18) {
  try {
    return Number(ethers.formatUnits(raw, decimals)).toFixed(4);
  } catch {
    return raw;
  }
}

function shortenAddr(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
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

export default function ActivityFeed({ events = [], loading }) {
  if (loading) {
    return (
      <div className="card">
        <p className="label mb-4">Recent Activity</p>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-dark-700 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <p className="label mb-4">Recent Activity</p>
      {events.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">No activity yet</p>
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
                    <span className={isBuy ? "badge-buy" : "badge-sell"}>
                      {e.type}
                    </span>
                    <span className="text-xs text-gray-500 ml-2">
                      {shortenAddr(e.user)}
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
                  <p className="text-xs text-gray-600 mt-0.5">
                    Block {e.block} · {timeAgo(e.timestamp)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}