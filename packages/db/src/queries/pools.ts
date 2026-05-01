import { eq, gte, sql } from "drizzle-orm";
import type { DbExecutor } from "./types.js";
import { detectedSandwiches, pools } from "../schema.js";

export type PoolRow = typeof pools.$inferSelect;

export async function getPool(
  db: DbExecutor,
  address: string,
): Promise<PoolRow | null> {
  const [row] = await db.select().from(pools).where(eq(pools.address, address)).limit(1);
  return row ?? null;
}

export async function recomputePoolRiskScores(db: DbExecutor): Promise<number> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
  const oneDayAgo = new Date(Date.now() - 86_400_000);

  const stats = await db
    .select({
      pool: detectedSandwiches.pool,
      dex: detectedSandwiches.dex,
      cnt7d: sql<number>`COUNT(*)::int`,
      cnt24h: sql<number>`SUM(CASE WHEN ${detectedSandwiches.blockTime} >= ${oneDayAgo.toISOString()} THEN 1 ELSE 0 END)::int`,
      avgLoss: sql<string | null>`AVG(${detectedSandwiches.lossUsd})::text`,
      sumLoss: sql<string | null>`COALESCE(SUM(${detectedSandwiches.lossUsd}), 0)::text`,
    })
    .from(detectedSandwiches)
    .where(gte(detectedSandwiches.blockTime, sevenDaysAgo))
    .groupBy(detectedSandwiches.pool, detectedSandwiches.dex);

  const maxLoss = stats.reduce(
    (acc, s) => Math.max(acc, parseFloat(s.sumLoss ?? "0")),
    1,
  );

  await db.transaction(async (tx) => {
    for (const s of stats) {
      const loss = parseFloat(s.sumLoss ?? "0");
      const score = Math.max(0, Math.min(1, loss / maxLoss));
      const riskScore = score.toFixed(2);
      await tx
        .insert(pools)
        .values({
          address: s.pool,
          dex: s.dex,
          sandwichCount24h: s.cnt24h,
          sandwichCount7d: s.cnt7d,
          avgLossUsd: s.avgLoss ? parseFloat(s.avgLoss).toFixed(2) : null,
          riskScore,
          lastRefreshed: new Date(),
        })
        .onConflictDoUpdate({
          target: pools.address,
          set: {
            sandwichCount24h: s.cnt24h,
            sandwichCount7d: s.cnt7d,
            avgLossUsd: s.avgLoss ? parseFloat(s.avgLoss).toFixed(2) : null,
            riskScore,
            lastRefreshed: new Date(),
          },
        });
    }
  });

  return stats.length;
}
