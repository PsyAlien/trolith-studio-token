# Trolith Studio Token — Backend API

REST API for the Trolith Studio Token economy. Reads on-chain data, caches events in PostgreSQL, and serves quotes, analytics, and admin transaction builders.

---

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL running locally (or a remote connection string)
- Contracts deployed (run `forge build` in the project root first)

### Setup

```bash
cd backend

# Install dependencies
npm install

# Copy env file and fill in your values
cp .env.example .env
# Edit .env → set SHOP_ADDRESS, DATABASE_URL, ADMIN_API_KEY

# Generate Prisma client + create DB tables
npx prisma generate
npx prisma db push

# Start the server
npm run dev
```

The server starts at `http://localhost:3000` by default.

---

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `PORT` | Server port | `3000` |
| `RPC_URL` | Ethereum JSON-RPC endpoint | `http://127.0.0.1:8545` |
| `SHOP_ADDRESS` | Deployed TokenShop address | `0xe7f1725E...` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/trolith_studio` |
| `ADMIN_API_KEY` | API key for admin endpoints | `my-secret-key-123` |
| `SYNC_INTERVAL_SECONDS` | Auto-sync interval (0 = disabled) | `15` |

---

## API Reference

### Health

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Health check |

### Shop (read-only, live from chain)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/shop/config` | Rates, fees, limits, paused status, TRI total supply |
| GET | `/api/shop/liquidity` | ETH + ERC-20 balances held by shop |

### Quotes (read-only, live from chain)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/quotes/buy-eth?amount=0.01` | TRI out for given ETH |
| GET | `/api/quotes/sell-eth?gen=10` | ETH out for given TRI |
| GET | `/api/quotes/buy-token?asset=0x...&amount=10` | TRI out for given ERC-20 |
| GET | `/api/quotes/sell-token?asset=0x...&gen=20` | ERC-20 out for given TRI |

### User (read-only)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/user/:address/balance` | On-chain TRI balance |
| GET | `/api/user/:address/history` | Buy/sell history + net positions from DB |

### Analytics (from cached DB events)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/analytics/summary` | Total buys/sells, TRI minted/burned, unique users |
| GET | `/api/analytics/per-asset` | Breakdown by payment asset |
| GET | `/api/analytics/activity?limit=15` | Recent unified activity feed |

### Sync

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/sync` | Manually trigger event sync from chain → DB |

### Admin (requires `x-admin-key` header)

All admin endpoints return **unsigned transaction data**. The admin signs and broadcasts from their wallet.

| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | `/api/admin/set-rates` | `{ asset, buyRate, sellRate }` | Update buy/sell rates |
| POST | `/api/admin/set-fee` | `{ feeBps }` | Update fee (0–1000 bps) |
| POST | `/api/admin/pause` | — | Pause the shop |
| POST | `/api/admin/unpause` | — | Unpause the shop |
| POST | `/api/admin/set-limits` | `{ maxEthIn?, maxGenIn? }` | Update tx limits |
| POST | `/api/admin/withdraw-eth` | `{ to, amountWei }` | Withdraw ETH from shop |
| POST | `/api/admin/set-supported-token` | `{ asset, supported }` | Enable/disable an asset |
| POST | `/api/admin/set-asset-decimals` | `{ asset, decimals }` | Set asset decimals |

---

## Event Sync

The backend caches `Bought` and `Sold` events from the TokenShop contract into PostgreSQL. This powers the analytics and user history endpoints.

**Two ways to sync:**

1. **Auto-sync:** Set `SYNC_INTERVAL_SECONDS=15` in `.env` — the server polls the chain every 15 seconds.
2. **Manual sync:** Call `POST /api/sync` — useful for testing or cron-based setups.

The sync is incremental — it only fetches events from blocks after the last synced block.

---

## Integration with wallet-with-taxes (Dual-Storage Design)

This backend runs alongside a second backend from the **[wallet-with-taxes](https://github.com/MashaVaverova/wallet-with-taxes)** project. Both backends watch the same `Bought` and `Sold` events from the TokenShop contract on the blockchain, but they store them in separate databases for different purposes.

### Why two databases?

| | This backend (Express) | wallet-with-taxes backend (NestJS) |
|---|---|---|
| **Database** | `trolith_studio` (PostgreSQL) | `genesis` (PostgreSQL) |
| **Purpose** | Analytics & economy monitoring | Swedish tax compliance |
| **Stores** | Raw event data (amounts, assets, blocks) | Tax events (acquisitions, disposals, gains/losses) |
| **Serves** | Dashboard, Portfolio, Activity feed | Tax Report page, CSV tax export |
| **Port** | 3000 (default) | 3001 |

### This is intentional, not duplication

Both backends independently poll the blockchain and store what they need. They do NOT talk to each other and do NOT share a database. This means:

- **If this backend goes down**, the tax system keeps working (and vice versa)
- **Each backend stores only what it needs** — this one stores raw event data for analytics, the other stores tax-classified events with cost basis tracking
- **No single point of failure** — both can reconstruct their data from the blockchain at any time
- **No data conflicts** — each owns its own database completely

### How it works

```
Blockchain (Anvil / testnet)
   │
   │  Bought / Sold events
   │
   ├──→ This backend (Express, port 3000)
   │      └─ Polls every 15s → saves to trolith_studio DB
   │         └─ Powers: Dashboard, Portfolio, Analytics API
   │
   └──→ wallet-with-taxes backend (NestJS, port 3001)
          └─ Polls every 2s → saves to genesis DB
             └─ Powers: Tax Report, CSV export, Swedish tax rules
```

### Port configuration

When running both backends locally, they must use different ports:

- This backend: `PORT=3000` (set in `backend/.env`)
- wallet-with-taxes: `PORT=3001` (set in its own `.env`)

The frontend connects to both:
- API calls to `/api/*` go to this backend (port 3000, via Vite proxy)
- Tax page calls go directly to the wallet-with-taxes backend (configurable via `VITE_TAX_API_URL` in `frontend/.env`)

---

## Testing with Postman

1. Start Anvil + deploy contracts (see main [DEMO.md](../DEMO.md))
2. Start the backend (`npm run dev`)
3. In Postman, create requests:
   - `GET http://localhost:3000/api/shop/config`
   - `GET http://localhost:3000/api/quotes/buy-eth?amount=0.01`
   - `POST http://localhost:3000/api/sync`
   - `GET http://localhost:3000/api/analytics/summary`
4. For admin endpoints, add header: `x-admin-key: <your-key-from-.env>`

---

## Architecture

```
Frontend (React, port 5173)
        │
        ├──── /api/* ────────────────┐
        │                            ▼
        │                   Express API (port 3000)
        │                       │
        │                  ┌────┴─────┐
        │                  │          │
        │                Routes    Services
        │                  │          │
        │                  │    ┌─────┴──────┐
        │                  │    │            │
        │                  │  sync.js    shop.js      ← reads from chain
        │                  │  (chain→DB)  analytics.js ← reads from DB
        │                  │
        │                  ▼
        │              PostgreSQL (trolith_studio)
        │
        └──── /tax/* ────────────────┐
                                     ▼
                            NestJS API (port 3001)
                            wallet-with-taxes backend
                                     │
                                     ▼
                            PostgreSQL (genesis)
                            Swedish tax compliance
```

---

## Folder Structure

```
backend/
├── prisma/
│   └── schema.prisma          # DB schema (Event, SyncState)
├── src/
│   ├── index.js               # Express app + sync loop
│   ├── config.js              # Env, provider, contract, helpers
│   ├── routes/
│   │   ├── shop.js            # /api/shop/*
│   │   ├── quotes.js          # /api/quotes/*
│   │   ├── user.js            # /api/user/*
│   │   ├── analytics.js       # /api/analytics/*
│   │   └── admin.js           # /api/admin/*
│   ├── services/
│   │   ├── sync.js            # Chain → DB event indexer
│   │   ├── shop.js            # On-chain read helpers
│   │   └── analytics.js       # DB aggregation queries
│   ├── middleware/
│   │   └── adminAuth.js       # API key auth
│   └── scripts/
│       └── sync-once.js       # One-shot sync script
├── .env.example
├── package.json
└── README.md
```