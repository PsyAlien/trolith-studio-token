# Trolith Studio Token — MVP Vertical Slice

**A controlled studio token economy with observability, guardrails, configurable pricing, and Swedish tax compliance**

---

> **This is not a production system.**
> It is a vertical slice MVP designed to prove architecture, flows, and traceability.

---

## 🎯 Project Goal

Build a small but real system that shows:

- How players buy and sell a studio token safely
- How tokens are minted and burned through a controlled shop with role-based access
- How multi-asset support (ETH + ERC-20) works with decimal normalization
- How a backend API serves quotes, analytics, and admin controls
- How a frontend lets users trade, view portfolios, manage the shop, and view tax reports
- How analytics and reporting make the economy observable
- How two independent projects can be integrated for tax compliance

**No speculation. No DeFi complexity.**

---

## 🧱 System Overview

### On-Chain (Solidity / Foundry)

#### StudioToken / TRI (ERC-20 + AccessControl)

The studio-wide token (TRI), shared with the wallet-with-taxes project.

- Built on OpenZeppelin's `ERC20` + `AccessControl`
- Role-based permissions: `MINTER_ROLE` and `BURNER_ROLE`
- Only addresses with `MINTER_ROLE` can mint new tokens
- Only addresses with `BURNER_ROLE` can burn tokens from their own balance
- Admin (`DEFAULT_ADMIN_ROLE`) manages role assignments
- Compatible with the wallet-with-taxes TRI contract (same interface: `mint(address,uint256)`, `burn(address,uint256)`)

#### TokenShop

Controlled buy/sell module with tax integration.

- ETH + ERC-20 support (USDT-style)
- Admin-configurable buy/sell rates (no hardcoded prices)
- Decimal normalization (handles 6-decimal tokens like USDT)
- Slippage protection on all trade functions
- Per-transaction limits (`maxEthIn`, `maxGenIn`)
- Configurable fee (basis points, capped at 10%)
- Pause/unpause functionality
- Supported asset allowlist
- Treasury ETH withdrawal
- Unified events for analytics (`Bought`, `Sold`)
- Quote helpers for off-chain price display
- **On-chain tax logging** via optional TaxProcessor integration (see Integration section)

#### ITaxProcessor (Interface)

Interface for the wallet-with-taxes TaxProcessor contract, enabling on-chain tax event logging from TokenShop trades.

### Backend API (Node.js / Express / PostgreSQL)

RESTful API that bridges the on-chain contracts with any frontend or client.

- **Shop endpoints** — live on-chain config, rates, liquidity, supported assets
- **Quote endpoints** — buy/sell quotes for ETH and ERC-20 assets
- **User endpoints** — GEN balance, buy/sell history, net positions
- **Analytics endpoints** — summary stats, per-asset breakdown, activity feed
- **Admin endpoints** — returns unsigned transaction data for admin operations (protected by API key)
- **Event sync** — incrementally indexes `Bought`/`Sold` events from chain into PostgreSQL
- **Shared PrismaClient singleton** — prevents connection exhaustion across services

### Frontend (React / Vite / Tailwind CSS)

Gaming-themed web interface for interacting with the token economy.

- **Dashboard** — stat cards, shop config, liquidity, activity feed, manual sync
- **Trade** — buy/sell GEN with ETH or any supported ERC-20, live quote fetching, MetaMask wallet signing
- **Portfolio** — GEN balance, net positions per asset, full transaction history
- **Tax Report** — Swedish tax summary from wallet-with-taxes backend (gains, losses, 70% loss deduction, CSV export)
- **Admin** — pause/unpause, set fees, set rates, set limits, withdraw ETH (admin wallet only)
- **Error handling** — error banners with retry on all pages
- **Wallet integration** — MetaMask connection, account/chain listeners, configurable admin address via `VITE_ADMIN_ADDRESS` env var

### Off-Chain CLI (Node.js)

#### Indexer

Standalone CLI analytics tool that reads on-chain events and produces:

- Per-asset summary (buys, sells, volumes)
- Per-user net positions
- Shop liquidity overview
- Unified recent activity feed
- Optional CSV export for reporting

---

## 🔗 Integration with wallet-with-taxes

This project integrates with **[wallet-with-taxes](https://github.com/MashaVaverova/wallet-with-taxes)** — a companion project developed by [Masha Vaverova](https://github.com/MashaVaverova) at Triolith Games. Her project handles user wallets, an NFT marketplace, and Swedish tax compliance (Skatteverket reporting with 70% loss deduction rules). The integration connects the TokenShop to her tax system so every token trade is automatically recorded for tax purposes. The integration has two layers:

### On-Chain Layer

TokenShop calls `TaxProcessor.logTaxEvent()` after every trade, creating an immutable tax record on the blockchain. The `gainOrLossSEK` value is set to 0 because the real SEK calculation happens in the backend (requires exchange rate APIs that smart contracts cannot access).

The TaxProcessor connection is **optional** — if no TaxProcessor is configured (`address(0)`), the shop works exactly the same, just without on-chain tax logging. This keeps all existing tests passing without modification.

### Backend Layer

A polling-based event listener in the wallet-with-taxes NestJS backend watches for `Bought` and `Sold` events from the TokenShop contract. When detected, it calls `TaxService.logEvent()` to save the trade as an `acquisition` or `disposal` in the `genesis` PostgreSQL database. The existing tax logic (Swedish 70% loss deduction) then applies to these events.

### Integration Architecture

```
User → TokenShop (Solidity)
  ├─ Mints/Burns TRI
  ├─ Logs to TaxProcessor (on-chain, optional)
  └─ Emits Bought/Sold event
        │
        ├─ Mohammad's backend (Express) polls for events
        │   └─ Saves to trolith_studio DB → Analytics API
        │
        └─ wallet-with-taxes backend (NestJS) polls for events
            └─ Saves to genesis DB → Tax API (Swedish rules)
                    │
                    └─ Frontend Tax Report page reads from here
```

### Files Changed for Integration

**In this project (trolith-studio-token):**
| File | Status | Description |
|------|--------|-------------|
| `src/interfaces/ITaxProcessor.sol` | NEW | Interface for TaxProcessor |
| `src/TokenShop.sol` | MODIFIED | Added `_logTax()`, `setTaxProcessor()`, tax calls in all 4 trade functions |
| `script/DeployIntegration.s.sol` | NEW | Deploys full integrated system (TRI + TaxProcessor + TokenShop) |

**In wallet-with-taxes:**
| File | Status | Description |
|------|--------|-------------|
| `backend/src/tokenshop/tokenshop-listener.service.ts` | NEW | Blockchain event listener (polls every 2s) |
| `backend/src/tokenshop/tokenshop.module.ts` | NEW | NestJS module for listener |
| `backend/src/shared/constants/abis/TokenShop.json` | NEW | ABI for decoding events |
| `backend/src/app.module.ts` | MODIFIED | Added TokenShopModule import |
| `backend/src/tax/tax.module.ts` | BUG FIX | Added TaxController to controllers |
| `backend/src/tax/tax.controller.ts` | MODIFIED | Lowercase addresses for case-insensitive matching |
| `backend/.env` | MODIFIED | Added TOKENSHOP_ADDRESS |

---

## 📁 Repository Structure

```
trolith-studio-token/
├── src/
│   ├── TokenShop.sol               # Buy/sell module with multi-asset + tax integration
│   └── interfaces/
│       ├── ITRI.sol                 # Interface for the wallet-with-taxes TRI token
│       └── ITaxProcessor.sol        # Interface for the wallet-with-taxes TaxProcessor
│
├── test/
│   ├── TokenShop.t.sol             # Core buy/sell flows, slippage, events
│   └── TokenShopComprehensive.t.sol # 44 tests: fees, pause, limits, ERC-20,
│                                    #   edge cases, slippage, admin access,
│                                    #   withdrawal, multi-asset, events, quotes
│
├── script/
│   ├── DeployShop.s.sol            # Standalone deploy (StudioToken + TokenShop + optional USDT)
│   ├── DeployIntegration.s.sol     # Integration deploy (TRI + TaxProcessor + TokenShop)
│   └── DeployMockUSDT.s.sol        # Deploys a mock 6-decimal USDT for testing
│
├── backend/
│   ├── prisma/
│   │   └── Schema.prisma           # DB schema (Event, SyncState)
│   ├── src/
│   │   ├── index.js                # Express app + sync loop
│   │   ├── config.js               # Env, provider, contract helpers
│   │   ├── db.js                   # Shared PrismaClient singleton
│   │   ├── routes/                 # shop, quotes, user, analytics, admin
│   │   ├── services/               # sync, shop reads, analytics queries
│   │   ├── middleware/             # Admin API key auth
│   │   └── scripts/                # One-shot sync script
│   ├── .env.example
│   ├── package.json
│   └── README.md                   # Backend-specific docs + full API reference
│
├── frontend/
│   ├── src/
│   │   ├── main.jsx                # React root with BrowserRouter + WalletProvider
│   │   ├── App.jsx                 # Route definitions (5 pages)
│   │   ├── index.css               # Tailwind + custom gaming theme classes
│   │   ├── context/
│   │   │   └── WalletContext.jsx    # MetaMask wallet state + admin detection
│   │   ├── hooks/
│   │   │   ├── useApi.js           # Backend API wrapper (null-safe, no infinite loops)
│   │   │   └── useContracts.js     # ethers.js contract instances
│   │   ├── components/
│   │   │   ├── Layout.jsx          # Page wrapper with Navbar
│   │   │   ├── Navbar.jsx          # Navigation (5 links) + wallet connect
│   │   │   ├── ConnectWallet.jsx   # Wallet button with admin badge
│   │   │   ├── StatCard.jsx        # Reusable stat display
│   │   │   ├── ActivityFeed.jsx    # Event list with buy/sell badges
│   │   │   └── ErrorBanner.jsx     # Error display with retry button
│   │   └── pages/
│   │       ├── Dashboard.jsx       # Economy overview + sync
│   │       ├── Trade.jsx           # Buy/sell with wallet signing
│   │       ├── Portfolio.jsx       # User balance + history
│   │       ├── TaxReport.jsx       # Swedish tax summary (from wallet-with-taxes backend)
│   │       └── Admin.jsx           # Admin-only shop management
│   ├── package.json
│   ├── vite.config.js              # Dev server + API proxy
│   ├── tailwind.config.js          # Gaming theme (neon colors, glow effects)
│   └── README.md                   # Frontend setup + MetaMask instructions
│
├── indexer/
│   └── index.js                    # CLI analytics & reporting tool
│
├── lib/                            # Foundry dependencies (OpenZeppelin, forge-std)
├── DEMO.md                         # Step-by-step demo walkthrough (standalone + integration)
├── foundry.toml                    # Foundry configuration
└── README.md
```

---

## ✅ What Is Implemented

### Safety & Guardrails

- Pause / unpause
- Supported asset allowlist
- Slippage protection on all user-facing functions
- Per-transaction limits (`maxEthIn`, `maxGenIn`)
- Role-based access control (MINTER / BURNER roles on TRI token)

### Configurable Pricing

- No hardcoded prices
- Admin-set buy/sell rates per asset
- Quote helpers (`getQuoteBuyETH`, `getQuoteSellToETH`, `getQuoteBuyToken`, `getQuoteSellToToken`)

### Fees & Treasury Ops

- Configurable fee in basis points (capped at 10%)
- Fees applied on trade execution
- Admin ETH withdrawal from shop

### Multi-Asset Support

- ETH + ERC-20 (e.g. USDT with 6 decimals)
- Automatic decimal normalization (`_to18` / `_from18`)
- Unified `Bought` / `Sold` events across all assets

### Tax Integration

- On-chain tax logging via optional TaxProcessor (immutable blockchain records)
- Backend event listener in the wallet-with-taxes NestJS backend (polls every 2 seconds)
- Automatic classification: buys = `acquisition`, sells = `disposal`
- Swedish tax calculation with 70% loss deduction (via TaxService)
- Tax summary API and CSV export
- Frontend Tax Report page with gains/losses breakdown

### Backend API

- 20+ REST endpoints (shop, quotes, user, analytics, admin)
- PostgreSQL event caching with incremental sync
- Shared PrismaClient singleton (no connection exhaustion)
- Accurate sync counts (only counts genuinely new events)
- Admin endpoints return unsigned tx data for wallet signing
- Auto-sync on configurable interval

### Frontend

- 5 pages: Dashboard, Trade, Portfolio, Tax Report, Admin
- MetaMask wallet connection with account/chain listeners
- Live quote fetching with debounce
- On-chain transaction signing (buy, sell, approve + trade)
- Tax report with Swedish rules (gains, losses, 70% deduction, CSV export)
- Error banners with retry on all data-fetching pages
- Configurable admin address via environment variable
- Gaming-themed UI (dark theme, neon accents, glow effects)

### Testing

- **TokenShop.t.sol** — core buy/sell flows, slippage, events
- **TokenShopComprehensive.t.sol** — 44 tests across 10 categories:
  1. Fee calculation (buy/sell with fees, fee cap, zero fee)
  2. Pause behavior (reverts when paused, admin still works, unpause)
  3. Transaction limits (above limit reverts, exact limit, updated limits)
  4. ERC-20 flows (USDT buy/sell, unsupported token reverts)
  5. Edge cases (zero amounts, sell more than balance)
  6. Slippage protection (minOut above actual reverts, exact match succeeds)
  7. Admin access control (non-owner reverts for all 6 admin functions)
  8. ETH withdrawal (partial, full, overdraw reverts)
  9. Multi-asset interactions (sequential ETH+USDT operations, multi-user economy)
  10. Event emission (Bought/Sold events with correct values for all 4 trade types)

### Analytics & Reporting

- Per-asset buy/sell volume summary
- Per-user net position tracking
- Shop liquidity monitoring (ETH + ERC-20 balances)
- GEN total supply tracking
- Unified recent activity feed
- CSV export via CLI indexer

---

## 🚫 Explicitly Out of Scope (By Design)

- Game spending contracts
- BTC bridge or off-chain asset workflows
- Real KYC / AML
- Fiat payments
- AMMs, curves, or DeFi mechanics
- Upgradeable proxies
- Real-time SEK price conversion (planned for future)
- Repository restructuring (folder reorganization planned for future — current structure works but could be cleaner)

**This MVP focuses on architecture and correctness, not polish.**

---

## ▶️ How to Run

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) installed
- Node.js 20+
- PostgreSQL running locally
- MetaMask browser extension (for frontend)

### Build & Test Contracts

```bash
forge build
forge test -vvv
```

To run just the comprehensive tests:

```bash
forge test -vvv --match-contract TokenShopComprehensive
```

### Deploy (Local Anvil)

#### Option A: Standalone (TokenShop only)

```bash
# Terminal 1: Start local chain
anvil

# Terminal 2: Deploy contracts
PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
forge script script/DeployShop.s.sol --rpc-url http://127.0.0.1:8545 --private-key $PK --broadcast
```

#### Option B: Integration (TokenShop + TaxProcessor)

```bash
# Terminal 1: Start local chain
anvil

# Terminal 2: Deploy integrated system (TRI + TaxProcessor + TokenShop)
forge script script/DeployIntegration.s.sol --tc DeployIntegration \
  --rpc-url http://127.0.0.1:8545 --broadcast
```

This deploys TRI, TaxProcessor, and TokenShop with all roles and connections configured.

### Start the Backend (port 3000)

```bash
cd backend
npm install
cp .env.example .env    # fill in SHOP_ADDRESS + DB credentials
npx prisma generate
npx prisma db push
npm run dev
```

Then open: `http://localhost:3000/api/health`

### Start wallet-with-taxes Backend (port 3001, for Tax Report)

If you want the Tax Report page to work, you also need the wallet-with-taxes backend:

```bash
cd /path/to/wallet-with-taxes/backend
npm install
# Make sure .env has PORT=3001 and TOKENSHOP_ADDRESS set
npm run start:dev
```

### Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

Then open: `http://localhost:5173`

**MetaMask setup (one-time):**

1. Add network: Name=`Anvil Local`, RPC=`http://127.0.0.1:8545`, Chain ID=`31337`, Symbol=`ETH`
2. Import admin account: Private Key=`0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
3. Import user account: Private Key=`0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`

### Run the CLI Indexer

```bash
cd indexer
npm install
SHOP=0x<shop-address> node index.js
```

See **[DEMO.md](DEMO.md)** for a full step-by-step walkthrough including the integration demo.

---

## 🧠 Design Philosophy

> Prefer clarity over cleverness
> Make economic flows observable
> Keep humans in control
> Build boring, auditable primitives

**This repo is meant to be read, understood, and extended.**

---

## 👤 Author / Context

Built as a learning-driven internship MVP for Triolith Games,
focused on understanding how a studio-level token economy can be built safely and transparently.

Integration with wallet-with-taxes developed collaboratively with [Masha Vaverova](https://github.com/MashaVaverova).