# Trolith Studio Token — MVP Vertical Slice

**A controlled studio token economy with observability, guardrails, and configurable pricing**

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
- How analytics and reporting make the economy observable

**No speculation. No DeFi complexity.**

---

## 🧱 System Overview

### On-Chain (Solidity / Foundry)

#### StudioToken (ERC-20 + AccessControl)

The studio-wide token (TST).

- Built on OpenZeppelin's `ERC20` + `AccessControl`
- Role-based permissions: `MINTER_ROLE` and `BURNER_ROLE`
- Only addresses with `MINTER_ROLE` can mint new tokens
- Only addresses with `BURNER_ROLE` can burn tokens from their own balance
- Admin (`DEFAULT_ADMIN_ROLE`) manages role assignments

#### TokenShop

Controlled buy/sell module.

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

### Backend API (Node.js / Express / PostgreSQL)

RESTful API that bridges the on-chain contracts with any frontend or client.

- **Shop endpoints** — live on-chain config, rates, liquidity
- **Quote endpoints** — buy/sell quotes for ETH and ERC-20 assets
- **User endpoints** — GEN balance, buy/sell history, net positions
- **Analytics endpoints** — summary stats, per-asset breakdown, activity feed
- **Admin endpoints** — returns unsigned transaction data for admin operations (protected by API key)
- **Event sync** — incrementally indexes `Bought`/`Sold` events from chain into PostgreSQL

### Off-Chain CLI (Node.js)

#### Indexer

Standalone CLI analytics tool that reads on-chain events and produces:

- Per-asset summary (buys, sells, volumes)
- Per-user net positions
- Shop liquidity overview
- Unified recent activity feed
- Optional CSV export for reporting

---

## 📁 Repository Structure

```
trolith-studio-token/
├── src/
│   ├── StudioToken.sol         # ERC-20 token with AccessControl roles
│   └── TokenShop.sol           # Buy/sell module with multi-asset support
│
├── test/
│   ├── StudioToken.t.sol       # Role management, mint/burn permission tests
│   └── TokenShop.t.sol         # Buy/sell flows, slippage, limits, events
│
├── script/
│   ├── DeployShop.s.sol        # Deploys StudioToken + TokenShop + optional USDT config
│   └── DeployMockUSDT.s.sol    # Deploys a mock 6-decimal USDT for testing
│
├── backend/
│   ├── prisma/
│   │   └── schema.prisma       # DB schema (Event, SyncState)
│   ├── src/
│   │   ├── index.js            # Express app + sync loop
│   │   ├── config.js           # Env, provider, contract helpers
│   │   ├── routes/             # shop, quotes, user, analytics, admin
│   │   ├── services/           # sync, shop reads, analytics queries
│   │   ├── middleware/         # Admin API key auth
│   │   └── scripts/            # One-shot sync script
│   ├── .env.example
│   ├── package.json
│   └── README.md               # Backend-specific docs + full API reference
│
├── indexer/
│   └── index.js                # CLI analytics & reporting tool
│
├── lib/                        # Foundry dependencies (OpenZeppelin, forge-std)
├── DEMO.md                     # Step-by-step demo walkthrough
├── foundry.toml                # Foundry configuration
└── README.md
```

---

## ✅ What Is Implemented

### Safety & Guardrails

- Pause / unpause
- Supported asset allowlist
- Slippage protection on all user-facing functions
- Per-transaction limits (`maxEthIn`, `maxGenIn`)
- Role-based access control (MINTER / BURNER roles on StudioToken)

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

### Backend API

- 20 REST endpoints (shop, quotes, user, analytics, admin)
- PostgreSQL event caching with incremental sync
- Admin endpoints return unsigned tx data for wallet signing
- Auto-sync on configurable interval

### Analytics & Reporting

- Per-asset buy/sell volume summary
- Per-user net position tracking
- Shop liquidity monitoring (ETH + ERC-20 balances)
- GEN total supply tracking
- Unified recent activity feed
- CSV export via CLI indexer

---

## 🚫 Explicitly Out of Scope (By Design)

- Frontend UI
- Game spending contracts
- BTC bridge or off-chain asset workflows
- Real KYC / AML
- Fiat payments
- AMMs, curves, or DeFi mechanics
- Upgradeable proxies

**This MVP focuses on architecture and correctness, not polish.**

---

## ▶️ How to Run

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) installed
- Node.js 20+
- PostgreSQL running locally

### Build & Test Contracts

```bash
forge build
forge test -vvv
```

### Deploy (Local Anvil)

```bash
# Terminal 1: Start local chain
anvil

# Terminal 2: Deploy contracts
PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
forge script script/DeployShop.s.sol --rpc-url http://127.0.0.1:8545 --private-key $PK --broadcast
```

### Start the Backend

```bash
cd backend
npm install
cp .env.example .env    # fill in SHOP_ADDRESS + DB credentials
npx prisma generate
npx prisma db push
npm run dev
```

Then open: `http://localhost:3000/api/health`

### Run the CLI Indexer

```bash
cd indexer
npm install
SHOP=0x<shop-address> node index.js
```

See **[DEMO.md](DEMO.md)** for a full step-by-step walkthrough including the backend.

---

## 🧠 Design Philosophy

> Prefer clarity over cleverness
> Make economic flows observable
> Keep humans in control
> Build boring, auditable primitives

**This repo is meant to be read, understood, and extended.**

---

## 👤 Author / Context

Built as a learning-driven internship MVP for Trolith,
focused on understanding how a studio-level token economy can be built safely and transparently.