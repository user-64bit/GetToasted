import { sql } from "drizzle-orm";
import type { DbExecutor } from "./types.js";
import { detectedSandwiches, wallets, pools, validators } from "../schema.js";

export type GlobalStats = {
  totalSandwichesDetected: number;
  totalLossUsd: number;
  totalWalletsScanned: number;
  topAttacker: { address: string; count: number; lossUsd: number } | null;
  mostDangerousPool: { address: string; dex: string; riskScore: number } | null;
};

export async function getGlobalStats(db: DbExecutor): Promise<GlobalStats> {
  const [agg] = await db
    .select({
      sandwichCount: sql<number>`COUNT(*)::int`,
      totalLoss: sql<string>`COALESCE(SUM(${detectedSandwiches.lossUsd}), 0)::text`,
    })
    .from(detectedSandwiches);

  const [walletAgg] = await db
    .select({
      cnt: sql<number>`COUNT(*) FILTER (WHERE ${wallets.scanStatus} = 'complete')::int`,
    })
    .from(wallets);

  const [topAttacker] = await db
    .select({
      address: detectedSandwiches.attacker,
      count: sql<number>`COUNT(*)::int`,
      lossUsd: sql<string>`COALESCE(SUM(${detectedSandwiches.lossUsd}), 0)::text`,
    })
    .from(detectedSandwiches)
    .groupBy(detectedSandwiches.attacker)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(1);

  const [mostDangerousPool] = await db
    .select({
      address: pools.address,
      dex: pools.dex,
      riskScore: pools.riskScore,
    })
    .from(pools)
    .orderBy(sql`${pools.riskScore} DESC NULLS LAST`)
    .limit(1);

  return {
    totalSandwichesDetected: agg?.sandwichCount ?? 0,
    totalLossUsd: parseFloat(agg?.totalLoss ?? "0"),
    totalWalletsScanned: walletAgg?.cnt ?? 0,
    topAttacker: topAttacker
      ? {
          address: topAttacker.address,
          count: topAttacker.count,
          lossUsd: parseFloat(topAttacker.lossUsd),
        }
      : null,
    mostDangerousPool:
      mostDangerousPool && mostDangerousPool.riskScore
        ? {
            address: mostDangerousPool.address,
            dex: mostDangerousPool.dex,
            riskScore: parseFloat(mostDangerousPool.riskScore),
          }
        : null,
  };
}

export async function getValidatorTotal(db: DbExecutor): Promise<number> {
  const [row] = await db.select({ cnt: sql<number>`COUNT(*)::int` }).from(validators);
  return row?.cnt ?? 0;
}
