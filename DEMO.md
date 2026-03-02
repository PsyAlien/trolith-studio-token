# Trolith Studio Token MVP — Demo Script

This demo shows:

- **Deploy contracts** on a local chain (standalone or integrated)
- **Buy/Sell GEN via TokenShop** (ETH + USDT)
- **Start the backend API** and query it
- **Test admin endpoints** with Postman
- **Run the CLI indexer** for analytics
- **Run the frontend** and trade via the browser
- **Integration demo** — tax logging with the wallet-with-taxes backend

---

## Part 1: Standalone Demo

### 0) Start local chain (Anvil)

```bash
anvil
```

> Keep this running in a separate terminal throughout the demo.

---

### 1) Deploy contracts

In a new terminal, from the project root:

```bash
RPC=http://127.0.0.1:8545
PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

**Step 1a: Deploy MockUSDT first** (because DeployShop needs its address):

```bash
forge script script/DeployMockUSDT.s.sol:DeployMockUSDT \
  --rpc-url $RPC --private-key $PK --broadcast
```

Write down the printed address, e.g. `MockUSDT: 0x5FbDB2...`

**Step 1b: Deploy Token + Shop** (pass the USDT address so it's auto-configured):

```bash
USDT=0xYOUR_MOCK_USDT PK=$PK forge script script/DeployShop.s.sol:DeployShop \
  --rpc-url $RPC --private-key $PK --broadcast
```

You should see:
```
Deployer (admin): 0xf39F...2266
StudioToken:      0x...
TokenShop:        0x...
USDT configured:  0x...  ← same address as MockUSDT above
```

Write down:
- `SHOP=0x...` (TokenShop)
- `GEN=0x...` (StudioToken)
- `USDT=0x...` (MockUSDT — already configured in shop)

---

### 2) Run the tests

```bash
# Run all tests (StudioToken + TokenShop + Comprehensive)
forge test -vvv

# Or run just the 44 comprehensive tests
forge test -vvv --match-contract TokenShopComprehensive
```

Expected: all 44 comprehensive tests pass (fees, pause, limits, ERC-20, edge cases, slippage, admin access, withdrawal, multi-asset, events, quotes, rate config).

---

### 3) Start the backend API

In a new terminal:

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env` — set your `SHOP_ADDRESS` and PostgreSQL password:

```
SHOP_ADDRESS=0xYOUR_SHOP
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/trolith_studio?schema=public
ADMIN_API_KEY=my-secret-admin-key
```

Then:

```bash
npx prisma generate
npx prisma db push
npm run dev
```

Verify it's running:

```
http://localhost:3000/api/health
→ { "status": "ok", "timestamp": "..." }
```

---

### 4) Buy GEN using ETH

```bash
RPC=http://127.0.0.1:8545
PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
SHOP=0xYOUR_SHOP

cast send $SHOP "buyETH(uint256)" 0 \
  --value 10000000000000000 \
  --rpc-url $RPC --private-key $PK
```

**Result:** 0.01 ETH → 10 GEN minted.

Check via API (wait 15s for auto-sync or `POST /api/sync`):

```
http://localhost:3000/api/analytics/summary
→ { "totalBuys": 1, "totalGenMinted": "10", ... }

http://localhost:3000/api/user/0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266/balance
→ { "genBalance": "10.0" }
```

---

### 5) Buy GEN with USDT

USDT was already deployed (step 1a) and configured in the shop (step 1b).
You just need to mint some test USDT and trade with it:

```bash
# USDT=0x... (the MockUSDT address from step 1a)
ME=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

# Mint 100 USDT to yourself (this is a mock token, anyone can mint)
cast send $USDT "mint(address,uint256)" $ME 100000000 --rpc-url $RPC --private-key $PK

# Approve the shop to spend 100 USDT on your behalf
cast send $USDT "approve(address,uint256)" $SHOP 100000000 --rpc-url $RPC --private-key $PK

# Buy GEN with 50 USDT → expect 100 GEN (rate: 1 USDT = 2 GEN)
cast send $SHOP "buyToken(address,uint256,uint256)" $USDT 50000000 0 --rpc-url $RPC --private-key $PK
```

Check via API:

```
http://localhost:3000/api/user/0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266/balance
→ { "genBalance": "110.0" }

http://localhost:3000/api/shop/liquidity
→ { "ETH": "0.01", "mUSDT": 50 }
```

---

### 6) Sell GEN back to USDT

```bash
GEN=$(cast call $SHOP "token()(address)" --rpc-url $RPC)

# Approve shop to take 50 GEN
cast send $GEN "approve(address,uint256)" $SHOP 50000000000000000000 --rpc-url $RPC --private-key $PK

# Sell 50 GEN → expect 25 USDT back
cast send $SHOP "sellToToken(address,uint256,uint256)" $USDT 50000000000000000000 0 --rpc-url $RPC --private-key $PK
```

Check via API:

```
http://localhost:3000/api/analytics/summary
→ { "totalBuys": 2, "totalSells": 1, "totalGenMinted": "110", "totalGenBurned": "50", "genTotalSupply": "60.0", ... }

http://localhost:3000/api/analytics/activity?limit=15
→ [BUY ETH, BUY mUSDT, SELL mUSDT]

http://localhost:3000/api/shop/liquidity
→ { "ETH": "0.01", "mUSDT": 25 }
```

---

### 7) Test admin endpoints (Postman)

Open Postman and create requests:

**Pause the shop:**
- Method: `POST`
- URL: `http://localhost:3000/api/admin/pause`
- Header: `x-admin-key: my-secret-admin-key`
- Response: unsigned tx data to sign and broadcast

**Set fee to 1%:**
- Method: `POST`
- URL: `http://localhost:3000/api/admin/set-fee`
- Header: `x-admin-key: my-secret-admin-key`
- Body (raw JSON):
```json
{
  "feeBps": 100
}
```

**Set new ETH rates:**
- Method: `POST`
- URL: `http://localhost:3000/api/admin/set-rates`
- Header: `x-admin-key: my-secret-admin-key`
- Body (raw JSON):
```json
{
  "asset": "0x0000000000000000000000000000000000000000",
  "buyRate": "2000000000000000000000",
  "sellRate": "2000000000000000000000"
}
```

---

### 8) Frontend walkthrough

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

Opens at: `http://localhost:5173`

**MetaMask setup (one-time):**

1. Add network:
   - Network Name: `Anvil Local`
   - RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `31337`
   - Currency Symbol: `ETH`

2. Import admin account:
   - Click MetaMask → Import Account → Private Key
   - Paste: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
   - This is the Anvil default deployer (admin wallet)

3. Import user account (for trading):
   - Click MetaMask → Import Account → Private Key
   - Paste: `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`
   - This is Anvil account 1 (user wallet)

**Page-by-page tour:**

1. **Dashboard** — see 4 stat cards (GEN supply, total buys/sells, unique users), shop liquidity, config panel, activity feed. Click "Sync Now" to pull latest on-chain events.

2. **Trade** — connect wallet → toggle Buy/Sell → select asset (ETH or USDT) → enter amount → see live quote → click "Buy GEN" → approve MetaMask popup → wait for tx confirmation.

3. **Portfolio** — after trading, see your GEN balance, net positions per asset, and full transaction history. Click "Refresh" to sync + reload.

4. **Tax** — shows Swedish tax summary (requires the wallet-with-taxes backend on port 3001, see Part 2 below). Shows gains, losses, 70% loss deduction, and net taxable amount. Click "Export CSV" to download a tax report.

5. **Admin** — only accessible with the admin wallet (Anvil deployer). See current config, then try:
   - Pause/unpause the shop
   - Set fee to 1% (100 bps)
   - Set new ETH buy/sell rates
   - Set max ETH or GEN limits

> If any API call fails, an error banner appears at the top of the page with a "Retry" button.

---

### 9) CLI Indexer (optional)

```bash
cd indexer
npm install
SHOP=0xYOUR_SHOP node index.js
```

Example output:

```
==== TokenShop Analytics ====
Shop: 0xe7f1...0512
GEN token: 0x5FbD...0aa3

---- Summary ----
Total buys: 2
Total sells: 1
Total GEN minted (via buys): 110 GEN
Total GEN burned (via sells): 50 GEN
GEN total supply: 60 GEN
Unique users: 1 (1 buyers, 1 sellers)

---- Shop Liquidity ----
ETH: 0.01
mUSDT: 25

---- Per-Asset Summary ----
Asset: ETH
  Buys: 1 | Sells: 0
Asset: mUSDT
  Buys: 1 | Sells: 1

---- Recent Activity (last 15) ----
[block 4]  BUY  paid 0.01 ETH → 10 GEN
[block 11] BUY  paid 50 mUSDT → 100 GEN
[block 13] SELL burned 50 GEN → 25 mUSDT
```

Export to CSV:

```bash
SHOP=0xYOUR_SHOP node index.js --csv report.csv
```

---

## Part 2: Integration Demo (Tax Compliance)

This part demonstrates the full integration with the wallet-with-taxes project, showing that every TokenShop trade is automatically recorded in the Swedish tax system.

### Prerequisites

- The wallet-with-taxes project cloned and set up
- PostgreSQL database `genesis` created
- All of Part 1's prerequisites

### 10) Deploy integrated contracts

> **Important:** Restart Anvil if it was already running (to get a clean chain).

```bash
anvil
```

In a new terminal:

```bash
cd trolith-studio-token
forge script script/DeployIntegration.s.sol --tc DeployIntegration \
  --rpc-url http://127.0.0.1:8545 --broadcast
```

Expected output:
```
TRI token:       0x5FbDB2315678afecb367f032d93F642f64180aa3
TaxProcessor:    0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
TokenShop:       0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
```

Update both `.env` files:
- `trolith-studio-token/backend/.env` → set `SHOP_ADDRESS=0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0`
- `wallet-with-taxes/backend/.env` → set `TOKENSHOP_ADDRESS=0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0` and `PORT=3001`

### 11) Start both backends

**Terminal A — wallet-with-taxes backend (port 3001):**

```bash
cd wallet-with-taxes/backend
npm run start:dev
```

Wait for: `TokenShop polling listener is active`

**Terminal B — Your backend (port 3000):**

```bash
cd trolith-studio-token/backend
npx prisma db push --force-reset   # clean database for fresh demo
npm run dev
```

Wait for: `Trolith Studio Backend running on http://localhost:3000`

### 12) Start the frontend

**Terminal C:**

```bash
cd trolith-studio-token/frontend
npm run dev
```

Open `http://localhost:5173`

### 13) Verify everything is connected

```bash
curl http://localhost:3000/api/health
# → { "status": "ok" }

curl http://localhost:3001/tax/summary?user=0x0000000000000000000000000000000000000000
# → { "totalGainsUSD": 0, "totalLossesUSD": 0, "adjustedLossesUSD": 0, "netTaxableGainUSD": 0 }
```

### 14) Tax gain scenario (buy cheap, sell expensive)

This scenario creates a capital gain to demonstrate the tax calculation.

Use Anvil account 1 (the user account):
```bash
USER_PK=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
ADMIN_PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
RPC=http://127.0.0.1:8545
SHOP=0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
TRI=0x5FbDB2315678afecb367f032d93F642f64180aa3
```

**Step 1 — Buy 10 TRI for 0.01 ETH** (acquisition at cost 0.01):
```bash
cast send $SHOP "buyETH(uint256)" 0 \
  --value 0.01ether --private-key $USER_PK --rpc-url $RPC
```

**Step 2 — Change sell rate to make TRI more valuable:**
```bash
cast send $SHOP "setRates(address,uint256,uint256)" \
  0x0000000000000000000000000000000000000000 \
  1000000000000000000000 500000000000000000000 \
  --private-key $ADMIN_PK --rpc-url $RPC
```

**Step 3 — Approve TokenShop to spend TRI:**
```bash
cast send $TRI "approve(address,uint256)" $SHOP 10000000000000000000 \
  --private-key $USER_PK --rpc-url $RPC
```

**Step 4 — Fund shop with ETH for the sell payout:**
```bash
cast send $SHOP --value 1ether --private-key $ADMIN_PK --rpc-url $RPC
```

**Step 5 — Sell 10 TRI for 0.02 ETH** (disposal at price 0.02):
```bash
cast send $SHOP "sellToETH(uint256,uint256)" 10000000000000000000 0 \
  --private-key $USER_PK --rpc-url $RPC
```

**Step 6 — Verify tax calculation (wait 3 seconds for polling):**
```bash
curl http://localhost:3001/tax/summary?user=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
```

Expected:
```json
{
  "totalGainsUSD": 0.1,
  "totalLossesUSD": 0,
  "adjustedLossesUSD": 0,
  "netTaxableGainUSD": 0.1
}
```

**The math:**
- Bought 10 TRI for 0.01 ETH → cost per TRI = 0.001 ETH
- Sold 10 TRI for 0.02 ETH → proceeds per TRI = 0.002 ETH
- Gain per TRI = 0.002 - 0.001 = 0.001 ETH
- Total gain = 0.001 × 10 = **0.01 ETH** (stored as 0.1 in the system)

### 15) Check the frontend Tax page

1. Open `http://localhost:5173`
2. Connect MetaMask with the **user account** (0x7099...)
3. Click the **Tax** tab in the navigation
4. You should see:
   - Total Gains: $0.10
   - Total Losses: $0.00
   - Adjusted Losses (70%): $0.00
   - Net Taxable Gain: $0.10
5. Click **Export CSV** to download the tax report

### 16) Full frontend flow

For the complete demo, stay on the frontend:

1. **Dashboard** → Click "Sync Now" → See the 2 events (1 buy, 1 sell)
2. **Trade** → Buy 5 more TRI with ETH
3. **Portfolio** → See updated balance and transaction history
4. **Tax** → Click "Refresh" → See updated tax summary
5. **Admin** (switch to admin account in MetaMask) → Change fee to 1%
6. **Trade** (switch back to user account) → Buy again → See fee applied in the quote

---

## Troubleshooting

### Frontend shows old data
Reset the databases and restart:
```bash
# Reset your database
cd trolith-studio-token/backend
npx prisma db push --force-reset

# Reset the wallet-with-taxes database
psql -U postgres -c "DROP DATABASE genesis;" -c "CREATE DATABASE genesis;"
```
Then restart both backends.

### Tax page shows all zeros
Check that the wallet address in MetaMask matches the one that did the trades. MetaMask sends lowercase addresses; the listener now stores lowercase too (after the fix in `tax.controller.ts`).

### Port 3000 already in use
```bash
npx kill-port 3000
```

### wallet-with-taxes backend won't start
Make sure `.env` has `PORT=3001` (not 3000) and that PostgreSQL is running with the `genesis` database created.