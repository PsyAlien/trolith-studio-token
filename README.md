Trolith Studio Token — MVP Vertical Slice
A controlled studio token economy with observability, guardrails, and configurable pricing


This is not a production system.
It is a vertical slice MVP designed to prove architecture, flows, and traceability.


🎯 Project Goal
Build a small but real system that shows:

How players buy and sell a studio token safely
How tokens are minted and burned through a controlled shop with role-based access
How multi-asset support (ETH + ERC-20) works with decimal normalization
How analytics and reporting make the economy observable

No speculation. No DeFi complexity. No frontend needed.

🧱 System Overview
On-Chain (Solidity / Foundry)
StudioToken (ERC-20 + AccessControl)
The studio-wide token (TST).

Built on OpenZeppelin's ERC20 + AccessControl
Role-based permissions: MINTER_ROLE and BURNER_ROLE
Only addresses with MINTER_ROLE can mint new tokens
Only addresses with BURNER_ROLE can burn tokens from their own balance
Admin (DEFAULT_ADMIN_ROLE) manages role assignments

TokenShop
Controlled buy/sell module.

ETH + ERC-20 support (USDT-style)
Admin-configurable buy/sell rates (no hardcoded prices)
Decimal normalization (handles 6-decimal tokens like USDT)
Slippage protection on all trade functions
Per-transaction limits (maxEthIn, maxGenIn)
Configurable fee (basis points, capped at 10%)
Pause/unpause functionality
Supported asset allowlist
Treasury ETH withdrawal
Unified events for analytics (Bought, Sold)
Quote helpers for off-chain price display

Off-Chain (Node.js)
Indexer
Reads on-chain Bought and Sold events from the TokenShop and produces:

Per-asset summary (buys, sells, volumes)
Per-user net positions
Fee and treasury overview
ETH pricing and quote snapshots
Unified recent activity feed (last 15 events)
Optional CSV export for reporting


📁 Repository Structure
trolith-studio-token/
├── src/
│   ├── StudioToken.sol       # ERC-20 token with AccessControl roles
│   └── TokenShop.sol         # Buy/sell module with multi-asset support
│
├── test/
│   ├── StudioToken.t.sol     # Role management, mint/burn permission tests
│   └── TokenShop.t.sol       # Buy/sell flows, slippage, limits, events
│
├── script/
│   ├── DeployShop.s.sol      # Deploys StudioToken + TokenShop + optional USDT config
│   └── DeployMockUSDT.s.sol  # Deploys a mock 6-decimal USDT for testing
│
├── indexer/
│   └── index.js              # Analytics & reporting (reads Bought/Sold events)
│
├── lib/                      # Foundry dependencies (OpenZeppelin, forge-std)
├── DEMO.md                   # Step-by-step demo walkthrough
├── foundry.toml              # Foundry configuration
└── README.md

✅ What Is Implemented
Safety & Guardrails

Pause / unpause
Supported asset allowlist
Slippage protection on all user-facing functions
Per-transaction limits (maxEthIn, maxGenIn)
Role-based access control (MINTER / BURNER roles on StudioToken)

Configurable Pricing

No hardcoded prices
Admin-set buy/sell rates per asset
Quote helpers (getQuoteBuyETH, getQuoteSellToETH, getQuoteBuyToken, getQuoteSellToToken)

Fees & Treasury Ops

Configurable fee in basis points (capped at 10%)
Fees applied on trade execution
Admin ETH withdrawal from shop

Multi-Asset Support

ETH + ERC-20 (e.g. USDT with 6 decimals)
Automatic decimal normalization (_to18 / _from18)
Unified Bought / Sold events across all assets

Analytics & Reporting

Per-asset buy/sell volume summary
Per-user net position tracking
Unified recent activity feed
CSV export (node index.js --csv report.csv)


🚫 Explicitly Out of Scope (By Design)

Frontend UI
Game spending contracts
BTC bridge or off-chain asset workflows
Real KYC / AML
Fiat payments
AMMs, curves, or DeFi mechanics
Upgradeable proxies

This MVP focuses on architecture and correctness, not polish.

▶️ How to Run
Prerequisites

Foundry installed
Node.js (for the indexer)

Build & Test
bashforge build
forge test -vvv
Deploy (Local Anvil)
bash# Start a local chain
anvil

# Deploy (in another terminal)
PK=<anvil-private-key> forge script script/DeployShop.s.sol --rpc-url http://127.0.0.1:8545 --broadcast

# Optional: deploy mock USDT
forge script script/DeployMockUSDT.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
Run the Indexer
bashcd indexer
npm install
SHOP=0x<shop-address> node index.js

# With CSV export
SHOP=0x<shop-address> node index.js --csv report.csv
See DEMO.md for a full step-by-step walkthrough.

🧠 Design Philosophy

Prefer clarity over cleverness
Make economic flows observable
Keep humans in control
Build boring, auditable primitives

This repo is meant to be read, understood, and extended.

👤 Author / Context
Built as a learning-driven internship MVP for Trolith,
focused on understanding how a studio-level token economy can be built safely and transparently.