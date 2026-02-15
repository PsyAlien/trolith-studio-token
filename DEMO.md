# Trolith Studio Token MVP — Demo Script

This demo shows:

- **Deploy contracts** on a local chain
- **Buy/Sell GEN via TokenShop** (ETH + USDT)
- **Start the backend API** and query it
- **Test admin endpoints** with Postman
- **Run the CLI indexer** for analytics
- **Run the frontend** and trade via the browser

---

## 🚀 Demo Walkthrough

### 0) Start local chain (Anvil)

```bash
anvil
```

> Keep this running in a separate terminal throughout the demo.

---

### 1) Deploy contracts (Token + Shop)

In a new terminal, from the project root:

```bash
RPC=http://127.0.0.1:8545
PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

forge script script/DeployShop.s.sol:DeployShop \
  --rpc-url $RPC --private-key $PK --broadcast
```

Write down the printed addresses:

- `SHOP=0x...` (TokenShop)
- `GEN=0x...` (StudioToken)

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

### 5) Deploy MockUSDT and buy GEN with it

```bash
# Deploy MockUSDT
forge script script/DeployMockUSDT.s.sol:DeployMockUSDT \
  --rpc-url $RPC --private-key $PK --broadcast

USDT=0xYOUR_USDT
ME=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

# Configure USDT in shop
cast send $SHOP "setSupportedToken(address,bool)" $USDT true --rpc-url $RPC --private-key $PK
cast send $SHOP "setAssetDecimals(address,uint8)" $USDT 6 --rpc-url $RPC --private-key $PK
cast send $SHOP "setRates(address,uint256,uint256)" $USDT 2000000000000000000 2000000000000000000 --rpc-url $RPC --private-key $PK

# Mint 100 USDT + approve shop
cast send $USDT "mint(address,uint256)" $ME 100000000 --rpc-url $RPC --private-key $PK
cast send $USDT "approve(address,uint256)" $SHOP 100000000 --rpc-url $RPC --private-key $PK

# Buy GEN with 50 USDT → expect 100 GEN
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

2. Import account:
   - Click MetaMask → Import Account → Private Key
   - Paste: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
   - This is the Anvil default deployer (admin wallet)

**Page-by-page tour:**

1. **Dashboard** — see 4 stat cards (GEN supply, total buys/sells, unique users), shop liquidity, config panel, activity feed. Click "Sync Now" to pull latest on-chain events.

2. **Trade** — connect wallet → toggle Buy/Sell → enter amount → see live quote → click "Buy GEN" → approve MetaMask popup → wait for tx confirmation. Try buying 10 GEN with 0.01 ETH.

3. **Portfolio** — after trading, see your GEN balance, net positions per asset, and full transaction history. Click "Refresh" to sync + reload.

4. **Admin** — only accessible with the admin wallet (Anvil deployer). See current config, then try:
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