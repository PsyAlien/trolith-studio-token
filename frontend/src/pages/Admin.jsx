import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useWallet } from "../context/WalletContext";
import { useContracts } from "../hooks/useContracts";
import { useApiData } from "../hooks/useApi";
import {
  Shield,
  Pause,
  Play,
  DollarSign,
  TrendingUp,
  Gauge,
  Download,
  Settings,
  CheckCircle,
  AlertTriangle,
  Lock,
} from "lucide-react";

function AdminAction({ title, icon: Icon, children, color = "purple" }) {
  const borderMap = {
    purple: "border-neon-purple/20",
    pink: "border-neon-pink/20",
    green: "border-neon-green/20",
    cyan: "border-neon-cyan/20",
  };
  return (
    <div className={`card border ${borderMap[color]}`}>
      <div className="flex items-center gap-2 mb-4">
        <Icon size={16} className="text-gray-400" />
        <h3 className="text-sm font-bold text-gray-200">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function TxResult({ status, message }) {
  if (!status) return null;
  return (
    <div
      className={`mt-3 p-2.5 rounded-lg border text-xs ${
        status === "success"
          ? "bg-neon-green/5 border-neon-green/20 text-neon-green"
          : status === "error"
          ? "bg-neon-pink/5 border-neon-pink/20 text-neon-pink"
          : "bg-neon-cyan/5 border-neon-cyan/20 text-neon-cyan"
      }`}
    >
      <div className="flex items-center gap-1.5">
        {status === "success" ? (
          <CheckCircle size={12} />
        ) : status === "error" ? (
          <AlertTriangle size={12} />
        ) : (
          <div className="w-3 h-3 border-2 border-neon-cyan border-t-transparent rounded-full animate-spin" />
        )}
        <span>{message}</span>
      </div>
    </div>
  );
}

export default function Admin() {
  const { isConnected, isAdmin } = useWallet();
  const { getShop, ready } = useContracts();
  const { data: config, refresh: refreshConfig } = useApiData("/shop/config");

  // Form states
  const [feeBps, setFeeBps] = useState("");
  const [buyRate, setBuyRate] = useState("");
  const [sellRate, setSellRate] = useState("");
  const [rateAsset, setRateAsset] = useState("0x0000000000000000000000000000000000000000");
  const [maxEthIn, setMaxEthIn] = useState("");
  const [maxGenIn, setMaxGenIn] = useState("");
  const [withdrawTo, setWithdrawTo] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");

  // Per-action status
  const [pauseStatus, setPauseStatus] = useState(null);
  const [pauseMsg, setPauseMsg] = useState("");
  const [feeStatus, setFeeStatus] = useState(null);
  const [feeMsg, setFeeMsg] = useState("");
  const [rateStatus, setRateStatus] = useState(null);
  const [rateMsg, setRateMsg] = useState("");
  const [limitStatus, setLimitStatus] = useState(null);
  const [limitMsg, setLimitMsg] = useState("");
  const [withdrawStatus, setWithdrawStatus] = useState(null);
  const [withdrawMsg, setWithdrawMsg] = useState("");

  // Pre-fill from config
  useEffect(() => {
    if (config) {
      setFeeBps(String(config.feeBps || 0));
    }
  }, [config]);

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Lock size={40} className="text-gray-500 mb-6" />
        <h2 className="text-xl font-bold text-gray-300 mb-2">Admin Panel</h2>
        <p className="text-gray-500 text-sm">Connect your admin wallet to access controls</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Shield size={40} className="text-neon-pink mb-6" />
        <h2 className="text-xl font-bold text-gray-300 mb-2">Access Denied</h2>
        <p className="text-gray-500 text-sm">
          This panel is only available to the shop admin wallet
        </p>
      </div>
    );
  }

  async function execTx(fn, setStatus, setMsg) {
    setStatus("pending");
    setMsg("Confirm in wallet...");
    try {
      const shop = getShop();
      const tx = await fn(shop);
      setMsg("Waiting for confirmation...");
      await tx.wait();
      setStatus("success");
      setMsg("Transaction confirmed!");
      refreshConfig();
    } catch (err) {
      setStatus("error");
      const reason = err.reason || err.message || "Failed";
      setMsg(reason.length > 80 ? reason.slice(0, 80) + "..." : reason);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Shield size={28} className="text-neon-purple" />
          <span className="glow-text-purple">Admin Panel</span>
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Manage TokenShop configuration — all actions are on-chain transactions
        </p>
      </div>

      {/* Current Status */}
      {config && (
        <div className="card mb-6 border border-dark-500">
          <p className="label mb-3 flex items-center gap-2">
            <Settings size={14} />
            Current Configuration
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-dark-700/50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Status</p>
              <p className={`text-sm font-bold ${config.paused ? "text-neon-pink" : "text-neon-green"}`}>
                {config.paused ? "PAUSED" : "ACTIVE"}
              </p>
            </div>
            <div className="bg-dark-700/50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Fee</p>
              <p className="text-sm font-mono">{config.feeBps} bps ({config.feePercent}%)</p>
            </div>
            <div className="bg-dark-700/50 rounded-lg p-3">
              <p className="text-xs text-gray-500">ETH Buy Rate</p>
              <p className="text-sm font-mono">{config.rates?.eth?.buyRate}</p>
            </div>
            <div className="bg-dark-700/50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Max ETH In</p>
              <p className="text-sm font-mono">{config.maxEthIn}</p>
            </div>
            <div className="bg-dark-700/50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Max GEN In</p>
              <p className="text-sm font-mono">{config.maxGenIn}</p>
            </div>
          </div>
        </div>
      )}

      {/* Admin Actions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Pause / Unpause */}
        <AdminAction title="Pause Control" icon={Pause} color="pink">
          <div className="flex gap-2">
            <button
              onClick={() =>
                execTx((shop) => shop.setPaused(true), setPauseStatus, setPauseMsg)
              }
              className="btn-danger flex-1 flex items-center justify-center gap-2"
              disabled={pauseStatus === "pending"}
            >
              <Pause size={14} /> Pause
            </button>
            <button
              onClick={() =>
                execTx((shop) => shop.setPaused(false), setPauseStatus, setPauseMsg)
              }
              className="btn-success flex-1 flex items-center justify-center gap-2"
              disabled={pauseStatus === "pending"}
            >
              <Play size={14} /> Unpause
            </button>
          </div>
          <TxResult status={pauseStatus} message={pauseMsg} />
        </AdminAction>

        {/* Fee */}
        <AdminAction title="Set Fee" icon={DollarSign} color="cyan">
          <div className="flex gap-2">
            <input
              type="number"
              value={feeBps}
              onChange={(e) => setFeeBps(e.target.value)}
              placeholder="bps (e.g. 100 = 1%)"
              className="input-field flex-1"
              min="0"
              max="1000"
            />
            <button
              onClick={() =>
                execTx(
                  (shop) => shop.setFeeBps(BigInt(feeBps)),
                  setFeeStatus,
                  setFeeMsg
                )
              }
              className="btn-primary"
              disabled={feeStatus === "pending" || !feeBps}
            >
              Set
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {feeBps ? `${Number(feeBps) / 100}% fee` : "0-1000 bps (0%-10%)"}
          </p>
          <TxResult status={feeStatus} message={feeMsg} />
        </AdminAction>

        {/* Rates */}
        <AdminAction title="Set Rates" icon={TrendingUp} color="green">
          <div className="space-y-2">
            <select
              value={rateAsset}
              onChange={(e) => setRateAsset(e.target.value)}
              className="input-field"
            >
              <option value="0x0000000000000000000000000000000000000000">ETH</option>
            </select>
            <input
              type="number"
              value={buyRate}
              onChange={(e) => setBuyRate(e.target.value)}
              placeholder="Buy rate (GEN per 1 unit, e.g. 1000)"
              className="input-field"
            />
            <input
              type="number"
              value={sellRate}
              onChange={(e) => setSellRate(e.target.value)}
              placeholder="Sell rate (GEN per 1 unit, e.g. 1000)"
              className="input-field"
            />
            <button
              onClick={() =>
                execTx(
                  (shop) =>
                    shop.setRates(
                      rateAsset,
                      ethers.parseUnits(buyRate, 18),
                      ethers.parseUnits(sellRate, 18)
                    ),
                  setRateStatus,
                  setRateMsg
                )
              }
              className="btn-primary w-full"
              disabled={rateStatus === "pending" || !buyRate || !sellRate}
            >
              Update Rates
            </button>
          </div>
          <TxResult status={rateStatus} message={rateMsg} />
        </AdminAction>

        {/* Limits */}
        <AdminAction title="Transaction Limits" icon={Gauge} color="purple">
          <div className="space-y-2">
            <input
              type="number"
              value={maxEthIn}
              onChange={(e) => setMaxEthIn(e.target.value)}
              placeholder="Max ETH in (e.g. 0.05)"
              className="input-field"
              step="any"
            />
            <input
              type="number"
              value={maxGenIn}
              onChange={(e) => setMaxGenIn(e.target.value)}
              placeholder="Max GEN in (e.g. 50)"
              className="input-field"
              step="any"
            />
            <button
              onClick={async () => {
                setLimitStatus("pending");
                setLimitMsg("Confirm in wallet...");
                try {
                  const shop = getShop();
                  if (maxEthIn) {
                    const tx = await shop.setMaxEthIn(ethers.parseEther(maxEthIn));
                    await tx.wait();
                  }
                  if (maxGenIn) {
                    const tx = await shop.setMaxGenIn(ethers.parseUnits(maxGenIn, 18));
                    await tx.wait();
                  }
                  setLimitStatus("success");
                  setLimitMsg("Limits updated!");
                  refreshConfig();
                } catch (err) {
                  setLimitStatus("error");
                  setLimitMsg(err.reason || err.message || "Failed");
                }
              }}
              className="btn-primary w-full"
              disabled={limitStatus === "pending" || (!maxEthIn && !maxGenIn)}
            >
              Update Limits
            </button>
          </div>
          <TxResult status={limitStatus} message={limitMsg} />
        </AdminAction>

        {/* Withdraw ETH */}
        <AdminAction title="Withdraw ETH" icon={Download} color="pink">
          <div className="space-y-2">
            <input
              type="text"
              value={withdrawTo}
              onChange={(e) => setWithdrawTo(e.target.value)}
              placeholder="Recipient address (0x...)"
              className="input-field"
            />
            <input
              type="number"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder="Amount (ETH)"
              className="input-field"
              step="any"
            />
            <button
              onClick={() =>
                execTx(
                  (shop) =>
                    shop.withdrawETH(withdrawTo, ethers.parseEther(withdrawAmount)),
                  setWithdrawStatus,
                  setWithdrawMsg
                )
              }
              className="btn-danger w-full"
              disabled={withdrawStatus === "pending" || !withdrawTo || !withdrawAmount}
            >
              Withdraw
            </button>
          </div>
          <TxResult status={withdrawStatus} message={withdrawMsg} />
        </AdminAction>
      </div>
    </div>
  );
}