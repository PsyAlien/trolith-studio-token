import { useState, useEffect } from "react";
import { useWallet } from "../context/WalletContext";
import ErrorBanner from "../components/ErrorBanner";
import StatCard from "../components/StatCard";
import {
  Receipt,
  TrendingUp,
  TrendingDown,
  Scale,
  Download,
  RefreshCw,
  Wallet,
} from "lucide-react";

/**
 * TAX REPORT PAGE
 *
 * This page talks to Masha's backend (port 3001) to show Swedish tax data.
 * Everything else in the frontend talks to our backend (port 3000).
 *
 * How it works:
 * 1. User connects wallet (MetaMask)
 * 2. We call Masha's GET /tax/summary?user=0x... endpoint
 * 3. We display gains, losses, and the Swedish-adjusted tax amount
 * 4. User can download a CSV tax report from GET /tax/export?user=0x...
 */

const TAX_API = "http://localhost:3001";

export default function TaxReport() {
  const { isConnected, address } = useWallet();

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchSummary() {
    if (!address) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${TAX_API}/tax/summary?user=${address}`
      );
      if (!res.ok) throw new Error("Failed to fetch tax summary");
      const data = await res.json();
      setSummary(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Fetch on connect
  useEffect(() => {
    if (isConnected && address) {
      fetchSummary();
    }
  }, [isConnected, address]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    if (!isConnected) return;
    const interval = setInterval(fetchSummary, 10000);
    return () => clearInterval(interval);
  }, [isConnected, address]);

  async function handleRefresh() {
    setRefreshing(true);
    await fetchSummary();
    setRefreshing(false);
  }

  function handleExportCSV() {
    if (!address) return;
    // Open the CSV download in a new tab
    window.open(`${TAX_API}/tax/export?user=${address}`, "_blank");
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="p-6 rounded-full bg-dark-800 border border-dark-600 mb-6">
          <Wallet size={40} className="text-gray-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-300 mb-2">
          Connect Your Wallet
        </h2>
        <p className="text-gray-500 text-sm">
          Connect your wallet to view your tax report
        </p>
      </div>
    );
  }

  const hasActivity =
    summary &&
    (summary.totalGainsUSD !== 0 ||
      summary.totalLossesUSD !== 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">
            <span className="glow-text-green">Tax Report</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Swedish crypto tax summary (Skatteverket)
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw
              size={14}
              className={refreshing ? "animate-spin" : ""}
            />
            Refresh
          </button>
          <button
            onClick={handleExportCSV}
            disabled={!summary}
            className="btn-secondary flex items-center gap-2"
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Error Banner */}
      <ErrorBanner message={error} onRetry={handleRefresh} />

      {/* Info Banner */}
      <div className="bg-neon-cyan/5 border border-neon-cyan/20 rounded-lg p-4 mb-8">
        <p className="text-sm text-gray-300">
          <span className="text-neon-cyan font-semibold">
            How this works:
          </span>{" "}
          Every time you buy or sell TRI tokens through the TokenShop, the
          transaction is automatically recorded in the tax system. This page
          shows your capital gains and losses calculated using Swedish tax
          rules, including the 70% loss deduction (avdragsbegränsning).
        </p>
      </div>

      {/* Loading State */}
      {loading && !summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-28 bg-dark-700 rounded-xl animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Stats Grid */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Total Gains"
            value={`$${summary.totalGainsUSD.toFixed(2)}`}
            sub="Capital gains from sales"
            color="green"
            icon={TrendingUp}
          />
          <StatCard
            label="Total Losses"
            value={`$${Math.abs(summary.totalLossesUSD).toFixed(2)}`}
            sub="Capital losses from sales"
            color="pink"
            icon={TrendingDown}
          />
          <StatCard
            label="Adjusted Losses (70%)"
            value={`$${Math.abs(summary.adjustedLossesUSD).toFixed(2)}`}
            sub="Swedish 70% deduction applied"
            color="purple"
            icon={Scale}
          />
          <StatCard
            label="Net Taxable Gain"
            value={`$${summary.netTaxableGainUSD.toFixed(2)}`}
            sub="Amount reported to Skatteverket"
            color="cyan"
            icon={Receipt}
          />
        </div>
      )}

      {/* Tax Explanation Card */}
      {summary && (
        <div className="card mb-8">
          <p className="label mb-4 flex items-center gap-2">
            <Scale size={14} />
            Swedish Tax Calculation
          </p>

          <div className="space-y-4">
            {/* Gains */}
            <div className="flex items-center justify-between p-3 bg-dark-700/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-lg bg-neon-green/10">
                  <TrendingUp size={14} className="text-neon-green" />
                </div>
                <span className="text-sm text-gray-300">
                  Total capital gains
                </span>
              </div>
              <span className="font-mono text-sm text-neon-green">
                +${summary.totalGainsUSD.toFixed(2)}
              </span>
            </div>

            {/* Losses */}
            <div className="flex items-center justify-between p-3 bg-dark-700/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-lg bg-neon-pink/10">
                  <TrendingDown size={14} className="text-neon-pink" />
                </div>
                <span className="text-sm text-gray-300">
                  Total capital losses
                </span>
              </div>
              <span className="font-mono text-sm text-neon-pink">
                -${Math.abs(summary.totalLossesUSD).toFixed(2)}
              </span>
            </div>

            {/* 70% rule */}
            <div className="flex items-center justify-between p-3 bg-dark-700/50 rounded-lg border border-neon-purple/20">
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-lg bg-neon-purple/10">
                  <Scale size={14} className="text-neon-purple" />
                </div>
                <div>
                  <span className="text-sm text-gray-300">
                    Adjusted losses (70% rule)
                  </span>
                  <p className="text-xs text-gray-500 mt-0.5">
                    In Sweden, only 70% of crypto losses are deductible
                  </p>
                </div>
              </div>
              <span className="font-mono text-sm text-neon-purple">
                -${Math.abs(summary.adjustedLossesUSD).toFixed(2)}
              </span>
            </div>

            {/* Divider */}
            <div className="border-t border-dark-500 my-2" />

            {/* Net result */}
            <div className="flex items-center justify-between p-4 bg-dark-700/50 rounded-lg border border-neon-cyan/30">
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-lg bg-neon-cyan/10">
                  <Receipt size={14} className="text-neon-cyan" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-gray-200">
                    Net taxable gain
                  </span>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Report this amount to Skatteverket
                  </p>
                </div>
              </div>
              <span
                className={`font-mono text-lg font-bold ${
                  summary.netTaxableGainUSD >= 0
                    ? "glow-text-green"
                    : "glow-text-pink"
                }`}
              >
                ${summary.netTaxableGainUSD.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* No Activity Message */}
      {summary && !hasActivity && (
        <div className="card text-center py-8">
          <p className="text-gray-500 text-sm">
            No taxable events yet. Buy and sell some TRI tokens on the{" "}
            <a href="/trade" className="text-neon-cyan hover:underline">
              Trade page
            </a>{" "}
            to see your tax impact here.
          </p>
        </div>
      )}

      {/* Wallet Address */}
      <div className="text-center mt-6">
        <p className="text-xs text-gray-600 font-mono">
          Wallet: {address}
        </p>
        <p className="text-xs text-gray-600 mt-1">
          Data source: Masha's tax backend (port 3001)
        </p>
      </div>
    </div>
  );
}