
import { ethers } from "ethers";
import { PrismaClient } from "@prisma/client";
import { shop, provider, getAssetSymbol } from "../config.js";

const prisma = new PrismaClient();
const ETH = ethers.ZeroAddress.toLowerCase();

function lower(addr) {
  try {
    return String(addr).toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Sync on-chain Bought / Sold events into the database.
 * Only fetches blocks after the last synced block.
 * Returns the number of new events indexed.
 */
export async function syncEvents() {
  const latest = await provider.getBlockNumber();

  // Get or create sync state
  let state = await prisma.syncState.findUnique({ where: { id: 1 } });
  if (!state) {
    state = await prisma.syncState.create({
      data: { id: 1, lastSyncedBlock: 0 },
    });
  }

  const fromBlock = state.lastSyncedBlock + 1;

  if (fromBlock > latest) {
    return { synced: 0, fromBlock, toBlock: latest };
  }

  // Fetch logs
  const boughtLogs = await shop.queryFilter(
    shop.filters.Bought(),
    fromBlock,
    latest
  );
  const soldLogs = await shop.queryFilter(
    shop.filters.Sold(),
    fromBlock,
    latest
  );

  let count = 0;

  // Process Bought events
  for (const ev of boughtLogs) {
    const args = ev.args ?? {};
    const user = lower(args.user ?? args.buyer);
    const asset = lower(args.payAsset ?? ethers.ZeroAddress) || ETH;
    const amountIn = (args.amountIn ?? args.paidWei ?? 0n).toString();
    const genOut = (args.genOut ?? 0n).toString();

    if (!user) continue;

    const symbol = await getAssetSymbol(asset);

    await prisma.event.upsert({
      where: {
        txHash_logIndex: {
          txHash: ev.transactionHash,
          logIndex: ev.index ?? ev.logIndex ?? 0,
        },
      },
      update: {},
      create: {
        type: "BUY",
        blockNumber: ev.blockNumber,
        txHash: ev.transactionHash,
        logIndex: ev.index ?? ev.logIndex ?? 0,
        user,
        asset,
        assetSymbol: symbol,
        amountIn,
        amountOut: genOut,
      },
    });
    count++;
  }

  // Process Sold events
  for (const ev of soldLogs) {
    const args = ev.args ?? {};
    const user = lower(args.user ?? args.seller);
    const asset = lower(args.payAsset ?? ethers.ZeroAddress) || ETH;
    const genIn = (args.genIn ?? 0n).toString();
    const amountOut = (args.amountOut ?? args.paidWei ?? 0n).toString();

    if (!user) continue;

    const symbol = await getAssetSymbol(asset);

    await prisma.event.upsert({
      where: {
        txHash_logIndex: {
          txHash: ev.transactionHash,
          logIndex: ev.index ?? ev.logIndex ?? 0,
        },
      },
      update: {},
      create: {
        type: "SELL",
        blockNumber: ev.blockNumber,
        txHash: ev.transactionHash,
        logIndex: ev.index ?? ev.logIndex ?? 0,
        user,
        asset,
        assetSymbol: symbol,
        amountIn: genIn,
        amountOut,
      },
    });
    count++;
  }

  // Update sync state
  await prisma.syncState.update({
    where: { id: 1 },
    data: { lastSyncedBlock: latest },
  });

  return { synced: count, fromBlock, toBlock: latest };
}