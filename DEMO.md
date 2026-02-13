# Trolith Studio Token MVP — Demo Script

This demo shows:

- **Deploy contracts** on a local chain
- **Buy/Sell GEN via TokenShop** (ETH + USDT)
- **Start the backend API** and query it
- **Test admin endpoints** with Postman
- **Run the CLI indexer** for analytics

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

### 2) Start the backend API

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

### 3) Buy GEN using ETH

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

### 4) Deploy MockUSDT and buy GEN with it

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

### 5) Sell GEN back to USDT

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

### 6) Test admin endpoints (Postman)

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

### 7) CLI Indexer (optional)

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