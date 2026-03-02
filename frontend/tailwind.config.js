/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        neon: {
          cyan: "#00f0ff",
          purple: "#b84dff",
          pink: "#ff2d7c",
          green: "#39ff14",
          yellow: "#ffe600",
        },
        dark: {
          900: "#0a0a0f",
          800: "#12121a",
          700: "#1a1a27",
          600: "#242436",
          500: "#2e2e45",
        },
      },
      boxShadow: {
        neon: "0 0 15px rgba(0, 240, 255, 0.3)",
        "neon-purple": "0 0 15px rgba(184, 77, 255, 0.3)",
        "neon-green": "0 0 15px rgba(57, 255, 20, 0.3)",
        "neon-pink": "0 0 15px rgba(255, 45, 124, 0.3)",
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', "monospace"],
      },
    },
  },
  plugins: [],
};