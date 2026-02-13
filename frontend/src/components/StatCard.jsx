export default function StatCard({ label, value, sub, color = "cyan", icon: Icon }) {
  const glowClass = {
    cyan: "glow-text-cyan",
    green: "glow-text-green",
    pink: "glow-text-pink",
    purple: "glow-text-purple",
  }[color] || "glow-text-cyan";

  const borderClass = {
    cyan: "hover:border-neon-cyan/30 hover:shadow-neon",
    green: "hover:border-neon-green/30 hover:shadow-neon-green",
    pink: "hover:border-neon-pink/30 hover:shadow-neon-pink",
    purple: "hover:border-neon-purple/30 hover:shadow-neon-purple",
  }[color] || "hover:border-neon-cyan/30 hover:shadow-neon";

  return (
    <div className={`card ${borderClass} transition-all duration-300`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="label">{label}</p>
          <p className={`text-2xl font-bold font-mono mt-1 ${glowClass}`}>
            {value}
          </p>
          {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
        </div>
        {Icon && (
          <div className={`p-2 rounded-lg bg-dark-700`}>
            <Icon size={20} className="text-gray-500" />
          </div>
        )}
      </div>
    </div>
  );
}