<div align="center">

# Triolith Genesis Engine — MVP Vertical Slice

**A controlled studio token economy with observability, guardrails, and off-chain bridge workflows**

---

> **This is not a production system.**  
> It is a vertical slice MVP designed to prove architecture, flows, and traceability.

</div>

---

## 🎯 Project Goal (Simple Words)

Build a small but real system that shows:

- How players buy and sell a studio token safely
- How tokens are spent in games and tracked on-chain
- How off-chain assets (BTC) can be credited and minted in a controlled way
- How analytics & reporting make the economy observable

**No speculation.**  
**No DeFi complexity.**  
**No frontend needed.**

---

## 🧱 System Overview

### On-chain (Solidity / Foundry)

#### **StudioToken (ERC-20)**
The studio-wide token (GEN / TST).  
Minted only by trusted contracts.

#### **TokenShop**
Controlled buy/sell module.

- ETH + ERC-20 support (USDT-style)
- Fixed rates (admin-set)
- Slippage protection
- Per-transaction limits
- Fees + treasury withdrawal
- Unified events for analytics

#### **GameSpender**
Optional game spending module.

- Burns or routes GEN
- Emits Spent events
- Makes in-game spending visible on-chain

### Off-chain (Node.js)

#### **Indexer**

Reads on-chain events

Produces:
- per-asset stats
- per-user net positions
- fee / treasury overview
- game spending summary

Exports CSV for reporting

#### **BTC Bridge (Skeleton)**

- Off-chain ledger (ledger.json)
- Prevents duplicate BTC credits
- Tracks pending vs minted credits
- Generates safe operatorMint commands
- Status + CSV export

---

## 📁 Repository Structure

```
trolith-studio-token
├── btc-bridge
│   ├── btc_report.csv
│   ├── index.js
│   ├── ledger.json
│   ├── package-lock.json
│   └── package.json
├── foundry.lock
├── foundry.toml
├── indexer
│   ├── index.js
│   ├── package-lock.json
│   ├── package.json
│   └── report.csv
├── script
│   ├── DeployMockUSDT.s.sol
│   ├── DeployShop.s.sol
│   └── DeploySpender.s.sol
├── src
│   ├── GameSpender.sol
│   ├── StudioToken.sol
│   └── TokenShop.sol
├── test
│   ├── GameSpender.t.sol
│   ├── StudioToken.t.sol
│   └── TokenShop.t.sol
├── DEMO.md
└── README.md
```

---

## ✅ What Is Already Implemented

### Phase 1 — Safety & Guardrails ✅

- Pause / unpause
- Allowlist
- Slippage protection
- Per-transaction limits
- Supported asset allowlist

### Phase 2 — Configurable Pricing ✅

- No hardcoded prices
- Admin-set buy/sell rates
- Quote helpers

### Phase 3 — Fees & Treasury Ops ✅

- Configurable fees
- Fees retained by shop
- Admin ETH withdrawal

### Phase 4 — Multi-Asset Support ✅

- ETH + ERC-20 (USDT-style)
- Decimal normalization
- Unified events

### Phase 5 — Analytics & Reporting ✅

- Per-asset summary
- Per-user net positions
- Game spending tracking
- CSV export

### Phase 6 — On-Chain Game Spending ✅

- GameSpender contract
- Spent events
- Reason-based tracking

### Phase 7 — BTC Bridge Skeleton ✅

- Off-chain BTC credit ledger
- Duplicate tx protection
- Pending vs minted flow
- Operator-only minting
- Status + CSV export

---

## 🚫 Explicitly Out of Scope (By Design)

- Frontend UI
- Real BTC node integration
- Real KYC / AML
- Fiat payments
- AMMs, curves, or DeFi mechanics
- Upgradeable proxies

**This MVP focuses on architecture and correctness, not polish.**

---

## ▶️ How to Run the Demo

See **[DEMO.md](DEMO.md)** for a full step-by-step demo script:

1. Deploy contracts
2. Buy / sell GEN
3. Spend GEN
4. Simulate BTC deposit
5. Operator mint
6. Run analytics
7. Export CSV

---

## 🧭 Next Steps (Planned)

### **Mint verification**
- Confirm on-chain that operator mint succeeded
- Prevent human error in bridge workflow

### **Indexer: bridge + shop unified view**
- Show operator mints alongside buys/sells/spends

### **Repo polish**
- Clear scripts
- Clean documentation
- One-command demo

### **Optional (later)**
- Minimal frontend
- Oracle-based pricing
- BTC automation

---

## 🧠 Design Philosophy

> Prefer clarity over cleverness  
> Make economic flows observable  
> Keep humans in control  
> Build boring, auditable primitives  

**This repo is meant to be read, understood, and extended.**

---

## 👤 Author / Context

Built as a learning-driven internship MVP for Triolith,  
focused on understanding how a studio-level token economy can be built safely and transparently.
