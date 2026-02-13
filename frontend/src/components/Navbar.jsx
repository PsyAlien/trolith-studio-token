import { NavLink } from "react-router-dom";
import { LayoutDashboard, ArrowLeftRight, Briefcase, Settings } from "lucide-react";
import ConnectWallet from "./ConnectWallet";
import { useWallet } from "../context/WalletContext";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/trade", label: "Trade", icon: ArrowLeftRight },
  { to: "/portfolio", label: "Portfolio", icon: Briefcase },
];

export default function Navbar() {
  const { isAdmin } = useWallet();

  return (
    <nav className="bg-dark-800 border-b border-dark-600 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-neon-cyan to-neon-purple flex items-center justify-center">
              <span className="text-dark-900 font-bold text-sm">T</span>
            </div>
            <span className="font-bold text-lg tracking-tight">
              <span className="glow-text-cyan">Trolith</span>
              <span className="text-gray-400 ml-1 text-sm font-normal">Studio</span>
            </span>
          </div>

          {/* Nav links */}
          <div className="flex items-center gap-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-dark-600 text-neon-cyan shadow-neon"
                      : "text-gray-400 hover:text-white hover:bg-dark-700"
                  }`
                }
              >
                <Icon size={16} />
                {label}
              </NavLink>
            ))}

            {isAdmin && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-neon-purple/10 text-neon-purple shadow-neon-purple border border-neon-purple/30"
                      : "text-gray-400 hover:text-neon-purple hover:bg-dark-700"
                  }`
                }
              >
                <Settings size={16} />
                Admin
              </NavLink>
            )}
          </div>

          {/* Wallet */}
          <ConnectWallet />
        </div>
      </div>
    </nav>
  );
}