# Triolith Genesis Engine MVP — Demo Script

This demo shows:
- Buy/Sell GEN via TokenShop (guardrails + rates)
- Spend GEN via GameSpender (Spent events)
- Off-chain BTC bridge skeleton (ledger + pending mints + operator mint)
- Analytics via indexer (per-asset + per-user + spending + operator mints)

---

## 🚀 Demo Walkthrough

### 0) Start local chain (Anvil)

```bash
anvil
```

> **Note:** Keep this running in a separate terminal.

---

### 1) Deploy contracts (Token + Shop + Spender)

In project root:

```bash
RPC=http://127.0.0.1:8545
PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

forge script script/DeployShop.s.sol:DeployShop --rpc-url $RPC --private-key $PK --broadcast
# (copy the printed addresses)

# If you have a deploy script for spender, run it too:
# forge script script/DeploySpender.s.sol:DeploySpender --rpc-url $RPC --private-key $PK --broadcast
```

**Write down:**
- `SHOP=0x...`
- `GEN=0x...` (StudioToken)
- `SPENDER=0x...`

---

### 2) Buy GEN using ETH (Shop)

```bash
RPC=http://127.0.0.1:8545
PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

SHOP=0xYOUR_SHOP
cast send $SHOP "buyETH(uint256)" 0 \
  --value 10000000000000000 \
  --rpc-url $RPC --private-key $PK
```

> **Result:** You bought 0.01 ETH worth of GEN

---

### 3) Spend GEN (GameSpender)

```bash
RPC=http://127.0.0.1:8545
PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

SHOP=0xYOUR_SHOP
SPENDER=0xYOUR_SPENDER
ME=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

GEN=$(cast call $SHOP "token()(address)" --rpc-url $RPC)

# allow ME as operator (owner-only)
cast send $SPENDER "setOperator(address,bool)" $ME true --rpc-url $RPC --private-key $PK

# approve spender to take GEN
cast send $GEN "approve(address,uint256)" $SPENDER 1000000000000000000 --rpc-url $RPC --private-key $PK

REASON=$(cast keccak "BATTLEPASS_S1")

# spend 1 GEN
cast send $SPENDER "spend(address,uint256,bytes32)" $ME 1000000000000000000 $REASON --rpc-url $RPC --private-key $PK
```

---

### 4) BTC bridge skeleton (off-chain ledger → operator mint)

Go to btc-bridge folder:

```bash
cd btc-bridge
```

**Record a BTC deposit (simulation):**

```bash
SHOP=0xYOUR_SHOP node index.js credit --user 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 --btc 0.01 --txid tx123
```

**List pending mints:**

```bash
SHOP=0xYOUR_SHOP node index.js mint-pending
```

Copy the printed cast command and run it (replace YOUR_OPERATOR_PK).

**Then mark minted:**

```bash
SHOP=0xYOUR_SHOP node index.js mark-minted tx123
```

**Check status + export CSV:**

```bash
SHOP=0xYOUR_SHOP node index.js status --csv btc_report.csv
```

---

### 5) Analytics (indexer)

Go to indexer folder:

```bash
cd ../indexer
```

**Run analytics:**

```bash
SHOP=0xYOUR_SHOP SPENDER=0xYOUR_SPENDER node index.js
```

**Export CSV:**

```bash

SHOP=0xYOUR_SHOP SPENDER=0xYOUR_SPENDER node index.js --csv report.csv

```

---

