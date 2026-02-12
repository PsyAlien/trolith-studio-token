# Triolith Studio Token MVP — Demo Script

This demo shows:

- **Buy/Sell GEN via TokenShop** (guardrails, configurable rates, slippage protection)
- **Multi-asset support** (ETH + ERC-20 like USDT)
- **Analytics via indexer** (summary, liquidity, per-asset, per-user, activity feed, CSV export)

---

## 🚀 Demo Walkthrough

### 0) Start local chain (Anvil)

```bash
anvil
```

> Keep this running in a separate terminal.

---

### 1) Deploy contracts (Token + Shop)

In project root:

```bash
RPC=http://127.0.0.1:8545
PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

forge script script/DeployShop.s.sol:DeployShop \
  --rpc-url $RPC --private-key $PK --broadcast
```

Write down the printed addresses:

- `SHOP=0x...` (TokenShop)
- `GEN=0x...` (StudioToken)

**Optional — deploy mock USDT:**

```bash
forge script script/DeployMockUSDT.s.sol:DeployMockUSDT \
  --rpc-url $RPC --private-key $PK --broadcast
```

Write down:

- `USDT=0x...` (MockUSDT)

To redeploy with USDT support baked in:

```bash
USDT=0xYOUR_USDT PK=$PK forge script script/DeployShop.s.sol:DeployShop \
  --rpc-url $RPC --broadcast
```

---

### 2) Buy GEN using ETH

```bash
RPC=http://127.0.0.1:8545
PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
SHOP=0xYOUR_SHOP

# Buy GEN with 0.01 ETH (minGenOut = 0 for demo, use a real value in production)
cast send $SHOP "buyETH(uint256)" 0 \
  --value 10000000000000000 \
  --rpc-url $RPC --private-key $PK
```

**Result:** 0.01 ETH → 10 GEN minted to your address (at default rate of 1 ETH = 1000 GEN).

Verify your balance:

```bash
GEN=$(cast call $SHOP "token()(address)" --rpc-url $RPC)
ME=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

cast call $GEN "balanceOf(address)(uint256)" $ME --rpc-url $RPC
# Expected: 10000000000000000000 (10e18 = 10 GEN)
```

---

### 3) Sell GEN back to ETH

First, fund the shop with ETH so it can pay out sells:

```bash
cast send $SHOP --value 1000000000000000000 \
  --rpc-url $RPC --private-key $PK
```

Approve the shop to spend your GEN, then sell:

```bash
# Approve shop to take 10 GEN
cast send $GEN "approve(address,uint256)" $SHOP 10000000000000000000 \
  --rpc-url $RPC --private-key $PK

# Sell 10 GEN back for ETH (minEthOut = 0 for demo)
cast send $SHOP "sellToETH(uint256,uint256)" 10000000000000000000 0 \
  --rpc-url $RPC --private-key $PK
```

**Result:** 10 GEN burned, 0.01 ETH returned to your address.

---

### 4) Buy/Sell GEN using USDT (optional)

If you deployed MockUSDT and configured it in the shop:

```bash
USDT=0xYOUR_USDT
ME=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

# Mint yourself some mock USDT (10 USDT = 10_000_000 in 6-decimal units)
cast send $USDT "mint(address,uint256)" $ME 10000000 \
  --rpc-url $RPC --private-key $PK

# Approve shop to take USDT
cast send $USDT "approve(address,uint256)" $SHOP 10000000 \
  --rpc-url $RPC --private-key $PK

# Buy GEN with 10 USDT (at default rate: 1 USDT = 2 GEN → expect 20 GEN)
cast send $SHOP "buyToken(address,uint256,uint256)" $USDT 10000000 0 \
  --rpc-url $RPC --private-key $PK
```

**Result:** 10 USDT → 20 GEN minted.

To sell GEN back to USDT:

```bash
# Approve shop to take GEN
cast send $GEN "approve(address,uint256)" $SHOP 20000000000000000000 \
  --rpc-url $RPC --private-key $PK

# Sell 20 GEN → expect 10 USDT back
cast send $SHOP "sellToToken(address,uint256,uint256)" $USDT 20000000000000000000 0 \
  --rpc-url $RPC --private-key $PK
```

---

### 5) Analytics (Indexer)

Go to the indexer folder and install dependencies:

```bash
cd indexer
npm install
```

Run analytics:

```bash
SHOP=0xYOUR_SHOP node index.js
```

Example output (after buying 10 USDT → 20 GEN):

```
==== TokenShop Analytics ====
RPC: http://127.0.0.1:8545
Shop: 0xe7f1...0512
GEN token: 0x5FbD...0aa3
Blocks: 0 → 17

---- Summary ----
Total buys: 1
Total sells: 0
Total GEN minted (via buys): 20 GEN
Total GEN burned (via sells): 0 GEN
GEN total supply: 20 GEN
Unique users: 1 (1 buyers, 0 sellers)

---- Ops Config ----
Fee: 0 bps (0%)

---- Shop Liquidity ----
ETH: 0
mUSDT: 10

---- ETH Pricing ----
Buy rate  (GEN per 1 ETH): 1000
Sell rate (GEN per 1 ETH): 1000
Quote: 0.01 ETH → GEN: 10
Quote: 10 GEN → ETH: 0.01

---- Per-Asset Summary ----
Asset: mUSDT
  Buys: 1 | Unique buyers: 1
  Sells: 0 | Unique sellers: 0
  Total paid in: 10 mUSDT
  Total GEN out: 20 GEN
  Total GEN in: 0 GEN
  Total paid out: 0 mUSDT

---- Per-User Net Positions ----
User: 0xf39f...2266
  mUSDT:
    buys=1, sells=0
    paid_in=10 | paid_out=0 | net=-10 mUSDT
    gen_out=20 | gen_in=0 | net=20 GEN

---- Recent Activity (last 15) ----
[block 17] BUY  0xf39f...2266  paid 10 mUSDT → 20 GEN
```

Export to CSV:

```bash
SHOP=0xYOUR_SHOP node index.js --csv report.csv
```

The CSV contains per-user net positions with columns: `user, asset, buys, sells, asset_in, asset_out, net_asset, gen_out, gen_in, net_gen`.
