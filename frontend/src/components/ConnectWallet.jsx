import { useWallet } from "../context/WalletContext";
import { Wallet, LogOut, Shield } from "lucide-react";

export default function ConnectWallet() {
  const { address, isConnected, isAdmin, connecting, connect, disconnect } =
    useWallet();

  if (isConnected) {
    return (
      <div className="flex items-center gap-3">
        {isAdmin && (
          <span className="badge bg-neon-purple/10 text-neon-purple border border-neon-purple/20">
            <Shield size={12} className="mr-1" />
            Admin
          </span>
        )}
        <span className="font-mono text-xs text-gray-400 bg-dark-700 px-3 py-1.5 rounded-lg border border-dark-500">
          {address.slice(0, 6)}...{address.slice(-4)}
        </span>
        <button
          onClick={disconnect}
          className="p-2 text-gray-400 hover:text-neon-pink transition-colors"
          title="Disconnect"
        >
          <LogOut size={16} />
        </button>
      </div>
    );
  }

  return (
    <button onClick={connect} disabled={connecting} className="btn-primary flex items-center gap-2">
      <Wallet size={16} />
      {connecting ? "Connecting..." : "Connect Wallet"}
    </button>
  );
}