import { useApiData, triggerSync } from "../hooks/useApi";
import StatCard from "../components/StatCard";
import ActivityFeed from "../components/ActivityFeed";
import ErrorBanner from "../components/ErrorBanner";
import {
  Coins,
  TrendingUp,
  TrendingDown,
  Users,
  Droplets,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";

export default function Dashboard() {
  const { data: summary, loading: summaryLoading, error: summaryError, refresh: refreshSummary } = useApiData("/analytics/summary");
  const { data: activity, loading: activityLoading, error: activityError, refresh: refreshActivity } = useApiData("/analytics/activity?limit=10");
  const { data: liquidity, loading: liqLoading, error: liqError, refresh: refreshLiq } = useApiData("/shop/liquidity");
  const { data: config, loading: configLoading, error: configError } = useApiData("/shop/config");

  const [syncing, setSyncing] = useState(false);

  // Combine errors
  const apiError = summaryError || activityError || liqError || configError;

  async function handleSync() {
    setSyncing(true);
    try {
      await triggerSync();
      await Promise.all([refreshSummary(), refreshActivity(), refreshLiq()]);
    } catch (err) {
      console.error("Sync failed:", err);
    } finally {
      setSyncing(false);
    }
  }

  function handleRetry() {
    refreshSummary();
    refreshActivity();
    refreshLiq();
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">
            <span className="glow-text-cyan">Dashboard</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">Token economy overview</p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Syncing..." : "Sync Now"}
        </button>
      </div>

      {/* Error Banner */}
      <ErrorBanner message={apiError} onRetry={handleRetry} />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="GEN Total Supply"
          value={summary?.genTotalSupply || "0"}
          sub="Circulating tokens"
          color="cyan"
          icon={Coins}
        />
        <StatCard
          label="Total Buys"
          value={summary?.totalBuys ?? "—"}
          sub={`${summary?.totalGenMinted || 0} GEN minted`}
          color="green"
          icon={TrendingUp}
        />
        <StatCard
          label="Total Sells"
          value={summary?.totalSells ?? "—"}
          sub={`${summary?.totalGenBurned || 0} GEN burned`}
          color="pink"
          icon={TrendingDown}
        />
        <StatCard
          label="Unique Users"
          value={summary?.uniqueUsers ?? "—"}
          sub={`${summary?.uniqueBuyers || 0} buyers · ${summary?.uniqueSellers || 0} sellers`}
          color="purple"
          icon={Users}
        />
      </div>

      {/* Liquidity + Config */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <div className="card-glow">
          <p className="label mb-3 flex items-center gap-2">
            <Droplets size={14} />
            Shop Liquidity
          </p>
          {liqLoading ? (
            <div className="h-16 bg-dark-700 rounded animate-pulse" />
          ) : liqError ? (
            <p className="text-neon-pink text-xs">Failed to load liquidity</p>
          ) : (
            <div className="space-y-2">
              {liquidity &&
                Object.entries(liquidity).map(([symbol, amount]) => (
                  <div
                    key={symbol}
                    className="flex items-center justify-between py-2 px-3 bg-dark-700/50 rounded-lg"
                  >
                    <span className="text-sm font-medium text-gray-300">{symbol}</span>
                    <span className="font-mono text-sm glow-text-cyan">{amount}</span>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="card-glow lg:col-span-2">
          <p className="label mb-3">Shop Config</p>
          {configLoading ? (
            <div className="h-16 bg-dark-700 rounded animate-pulse" />
          ) : configError ? (
            <p className="text-neon-pink text-xs">Failed to load config</p>
          ) : config ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-dark-700/50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Status</p>
                <p className={`text-sm font-semibold mt-0.5 ${config.paused ? "text-neon-pink" : "text-neon-green"}`}>
                  {config.paused ? "PAUSED" : "ACTIVE"}
                </p>
              </div>
              <div className="bg-dark-700/50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Fee</p>
                <p className="text-sm font-mono text-gray-200 mt-0.5">{config.feePercent}%</p>
              </div>
              <div className="bg-dark-700/50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Buy Rate (ETH)</p>
                <p className="text-sm font-mono text-gray-200 mt-0.5">
                  1 ETH = {config.rates?.eth?.buyRate || "—"} GEN
                </p>
              </div>
              <div className="bg-dark-700/50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Max ETH In</p>
                <p className="text-sm font-mono text-gray-200 mt-0.5">{config.maxEthIn} ETH</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Activity Feed */}
      <ActivityFeed events={activity || []} loading={activityLoading} />
    </div>
  );
}