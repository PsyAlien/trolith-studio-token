import "dotenv/config";
import { ethers } from "ethers";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---- Env ----
export const PORT = Number(process.env.PORT) || 3000;
export const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
export const SHOP_ADDRESS = process.env.SHOP_ADDRESS;
export const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "";
export const SYNC_INTERVAL = Number(process.env.SYNC_INTERVAL_SECONDS) || 0;

if (!SHOP_ADDRESS) {
  console.error("Missing SHOP_ADDRESS in .env");
  process.exit(1);
}

// ---- ABI loading ----
// Resolve paths relative to project root (one level up from src/)
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

function loadAbi(relativePath) {
  const fullPath = resolve(projectRoot, relativePath);
  const artifact = JSON.parse(readFileSync(fullPath, "utf8"));
  return artifact.abi;
}

let shopAbi;
try {
  shopAbi = loadAbi("../out/TokenShop.sol/TokenShop.json");
} catch {
  console.error(
    "Could not load TokenShop ABI. Make sure you ran `forge build` in the project root."
  );
  process.exit(1);
}

export const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
];

// ---- Provider & Contracts ----
export const provider = new ethers.JsonRpcProvider(RPC_URL);
export const shop = new ethers.Contract(SHOP_ADDRESS, shopAbi, provider);

// ---- Helpers ----
const _symbolCache = new Map();
const _decCache = new Map();

const ETH = ethers.ZeroAddress.toLowerCase();
_symbolCache.set(ETH, "ETH");
_decCache.set(ETH, 18);

export async function getAssetSymbol(assetLower) {
  const key = assetLower || ETH;
  if (_symbolCache.has(key)) return _symbolCache.get(key);

  let symbol = key;
  try {
    const erc20 = new ethers.Contract(key, ERC20_ABI, provider);
    symbol = await erc20.symbol();
  } catch {
    // fallback to address
  }
  _symbolCache.set(key, symbol);
  return symbol;
}

export async function getAssetDecimals(assetLower) {
  const key = assetLower || ETH;
  if (_decCache.has(key)) return _decCache.get(key);

  let d = 18;
  try {
    d = Number(await shop.assetDecimals(key));
  } catch {
    try {
      const erc20 = new ethers.Contract(key, ERC20_ABI, provider);
      d = Number(await erc20.decimals());
    } catch {
      d = 18;
    }
  }
  _decCache.set(key, d);
  return d;
}

export function fmtAmount(assetLower, amountRaw, decimals) {
  if (assetLower === ETH) return Number(ethers.formatEther(amountRaw));
  return Number(ethers.formatUnits(amountRaw, decimals));
}