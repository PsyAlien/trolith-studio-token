import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * High-level summary: total buys/sells, GEN minted/burned, unique users.
 */
export async function getSummary(genTotalSupply) {
  const [buyAgg, sellAgg, buyerCount, sellerCount, totalUsers] =
    await Promise.all([
      prisma.event.aggregate({
        where: { type: "BUY" },
        _count: true,
      }),
      prisma.event.aggregate({
        where: { type: "SELL" },
        _count: true,
      }),
      prisma.event.groupBy({
        by: ["user"],
        where: { type: "BUY" },
      }),
      prisma.event.groupBy({
        by: ["user"],
        where: { type: "SELL" },
      }),
      prisma.event.groupBy({
        by: ["user"],
      }),
    ]);

  // Sum GEN amounts from events
  const buyEvents = await prisma.event.findMany({
    where: { type: "BUY" },
    select: { amountOut: true },
  });
  const sellEvents = await prisma.event.findMany({
    where: { type: "SELL" },
    select: { amountIn: true },
  });

  const totalGenMinted = buyEvents.reduce(
    (sum, e) => sum + BigInt(e.amountOut),
    0n
  );
  const totalGenBurned = sellEvents.reduce(
    (sum, e) => sum + BigInt(e.amountIn),
    0n
  );

  return {
    totalBuys: buyAgg._count,
    totalSells: sellAgg._count,
    totalGenMinted: formatBigInt18(totalGenMinted),
    totalGenBurned: formatBigInt18(totalGenBurned),
    genTotalSupply,
    uniqueBuyers: buyerCount.length,
    uniqueSellers: sellerCount.length,
    uniqueUsers: totalUsers.length,
  };
}

/**
 * Per-asset breakdown: buy/sell counts, volumes, unique users.
 */
export async function getPerAsset() {
  const assets = await prisma.event.groupBy({
    by: ["asset", "assetSymbol"],
  });

  const result = [];

  for (const { asset, assetSymbol } of assets) {
    const buyEvents = await prisma.event.findMany({
      where: { type: "BUY", asset },
      select: { amountIn: true, amountOut: true, user: true },
    });
    const sellEvents = await prisma.event.findMany({
      where: { type: "SELL", asset },
      select: { amountIn: true, amountOut: true, user: true },
    });

    const totalPaidIn = buyEvents.reduce(
      (sum, e) => sum + BigInt(e.amountIn),
      0n
    );
    const totalGenOut = buyEvents.reduce(
      (sum, e) => sum + BigInt(e.amountOut),
      0n
    );
    const totalGenIn = sellEvents.reduce(
      (sum, e) => sum + BigInt(e.amountIn),
      0n
    );
    const totalPaidOut = sellEvents.reduce(
      (sum, e) => sum + BigInt(e.amountOut),
      0n
    );

    const uniqueBuyers = new Set(buyEvents.map((e) => e.user)).size;
    const uniqueSellers = new Set(sellEvents.map((e) => e.user)).size;

    result.push({
      asset,
      symbol: assetSymbol || asset,
      buys: buyEvents.length,
      sells: sellEvents.length,
      uniqueBuyers,
      uniqueSellers,
      totalPaidIn: totalPaidIn.toString(),
      totalGenOut: formatBigInt18(totalGenOut),
      totalGenIn: formatBigInt18(totalGenIn),
      totalPaidOut: totalPaidOut.toString(),
    });
  }

  return result;
}

/**
 * Recent unified activity feed.
 */
export async function getRecentActivity(limit = 15) {
  const events = await prisma.event.findMany({
    orderBy: [{ blockNumber: "desc" }, { logIndex: "desc" }],
    take: limit,
  });

  return events.map((e) => ({
    type: e.type,
    block: e.blockNumber,
    txHash: e.txHash,
    user: e.user,
    asset: e.asset,
    assetSymbol: e.assetSymbol,
    amountIn: e.amountIn,
    amountOut: e.amountOut,
    timestamp: e.createdAt,
  }));
}

/**
 * Per-user net positions across all assets.
 */
export async function getUserHistory(userAddress) {
  const user = userAddress.toLowerCase();

  const events = await prisma.event.findMany({
    where: { user },
    orderBy: [{ blockNumber: "desc" }, { logIndex: "desc" }],
  });

  // Aggregate per asset
  const assetMap = new Map();

  for (const e of events) {
    if (!assetMap.has(e.asset)) {
      assetMap.set(e.asset, {
        asset: e.asset,
        symbol: e.assetSymbol || e.asset,
        buys: 0,
        sells: 0,
        totalPaidIn: 0n,
        totalPaidOut: 0n,
        totalGenOut: 0n,
        totalGenIn: 0n,
      });
    }

    const a = assetMap.get(e.asset);
    if (e.type === "BUY") {
      a.buys++;
      a.totalPaidIn += BigInt(e.amountIn);
      a.totalGenOut += BigInt(e.amountOut);
    } else {
      a.sells++;
      a.totalGenIn += BigInt(e.amountIn);
      a.totalPaidOut += BigInt(e.amountOut);
    }
  }

  const positions = [...assetMap.values()].map((a) => ({
    asset: a.asset,
    symbol: a.symbol,
    buys: a.buys,
    sells: a.sells,
    totalPaidIn: a.totalPaidIn.toString(),
    totalPaidOut: a.totalPaidOut.toString(),
    totalGenOut: formatBigInt18(a.totalGenOut),
    totalGenIn: formatBigInt18(a.totalGenIn),
    netGen: formatBigInt18(a.totalGenOut - a.totalGenIn),
  }));

  return {
    user,
    positions,
    events: events.map((e) => ({
      type: e.type,
      block: e.blockNumber,
      txHash: e.txHash,
      asset: e.asset,
      assetSymbol: e.assetSymbol,
      amountIn: e.amountIn,
      amountOut: e.amountOut,
      timestamp: e.createdAt,
    })),
  };
}

// ---- Util ----
function formatBigInt18(val) {
  const str = val.toString();
  if (str === "0") return "0";
  const padded = str.padStart(19, "0");
  const intPart = padded.slice(0, -18) || "0";
  const decPart = padded.slice(-18).replace(/0+$/, "");
  return decPart ? `${intPart}.${decPart}` : intPart;
}