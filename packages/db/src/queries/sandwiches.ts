import { and, desc, eq, gte, lt, lte, sql } from "drizzle-orm";
import type { DbExecutor } from "./types.js";
import { detectedSandwiches, alerts, wallets, pools } from "../schema.js";

export type SandwichInsert = typeof detectedSandwiches.$inferInsert;
export type SandwichRow = typeof detectedSandwiches.$inferSelect;

export type SandwichListFilter = {
  victimWallet: string;
  fromDate?: Date;
  toDate?: Date;
  dex?: string;
  minLossUsd?: number;
};

export type SandwichListPage = {
  limit: number;
  cursor?: { id: bigint; blockTime: Date };
};

export async function batchInsertDetections(
  db: DbExecutor,
  rows: SandwichInsert[],
): Promise<{ inserted: SandwichRow[] }> {
  if (rows.length === 0) return { inserted: [] };

  // Deduplicate within the batch by (victim_sig, front_sig, back_sig)
  const seen = new Set<string>();
  const unique: SandwichInsert[] = [];
  for (const row of rows) {
    const key = `${row.victimSig}|${row.frontSig}|${row.backSig}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }

  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(detectedSandwiches)
      .values(unique)
      .onConflictDoNothing({ target: [
        detectedSandwiches.victimSig,
        detectedSandwiches.frontSig,
        detectedSandwiches.backSig,
      ] })
      .returning();

    if (inserted.length === 0) return { inserted: [] };

    // Aggregate per-victim updates
    const byVictim = new Map<
      string,
      { count: number; lossUsd: number; first: Date; last: Date }
    >();
    for (const row of inserted) {
      const lossNum = row.lossUsd ? parseFloat(row.lossUsd) : 0;
      const cur = byVictim.get(row.victimWallet) ?? {
        count: 0,
        lossUsd: 0,
        first: row.blockTime,
        last: row.blockTime,
      };
      cur.count += 1;
      cur.lossUsd += lossNum;
      if (row.blockTime < cur.first) cur.first = row.blockTime;
      if (row.blockTime > cur.last) cur.last = row.blockTime;
      byVictim.set(row.victimWallet, cur);
    }

    for (const [wallet, agg] of byVictim) {
      await tx
        .insert(wallets)
        .values({
          address: wallet,
          scanStatus: "pending",
          sandwichCount: agg.count,
          totalLossUsd: agg.lossUsd.toFixed(2),
          firstAttackAt: agg.first,
          lastAttackAt: agg.last,
        })
        .onConflictDoUpdate({
          target: wallets.address,
          set: {
            sandwichCount: sql`${wallets.sandwichCount} + ${agg.count}`,
            totalLossUsd: sql`${wallets.totalLossUsd} + ${agg.lossUsd.toFixed(2)}`,
            firstAttackAt: sql`LEAST(${wallets.firstAttackAt}, ${agg.first})`,
            lastAttackAt: sql`GREATEST(${wallets.lastAttackAt}, ${agg.last})`,
          },
        });
    }

    // Lazy upsert pools
    const byPool = new Map<string, { dex: string; tokenA: string; tokenB: string }>();
    for (const row of inserted) {
      if (!byPool.has(row.pool)) {
        byPool.set(row.pool, {
          dex: row.dex,
          tokenA: row.inputMint,
          tokenB: row.outputMint,
        });
      }
    }
    for (const [address, info] of byPool) {
      await tx
        .insert(pools)
        .values({
          address,
          dex: info.dex,
          tokenAMint: info.tokenA,
          tokenBMint: info.tokenB,
        })
        .onConflictDoNothing();
    }

    // Insert alerts for SSE fan-out
    await tx.insert(alerts).values(
      inserted.map((row) => ({
        wallet: row.victimWallet,
        sandwichId: row.id,
        kind: "sandwich_detected",
        payload: {
          slot: row.slot.toString(),
          dex: row.dex,
          attacker: row.attacker,
          lossUsd: row.lossUsd,
          confidence: row.confidence,
        },
      })),
    );

    return { inserted };
  });
}

export async function getSandwichesForWallet(
  db: DbExecutor,
  filter: SandwichListFilter,
  page: SandwichListPage,
): Promise<{ data: SandwichRow[]; nextCursor: { id: string; blockTime: string } | null }> {
  const conditions = [eq(detectedSandwiches.victimWallet, filter.victimWallet)];
  if (filter.fromDate) conditions.push(gte(detectedSandwiches.blockTime, filter.fromDate));
  if (filter.toDate) conditions.push(lte(detectedSandwiches.blockTime, filter.toDate));
  if (filter.dex) conditions.push(eq(detectedSandwiches.dex, filter.dex));
  if (filter.minLossUsd !== undefined) {
    conditions.push(
      sql`${detectedSandwiches.lossUsd} >= ${filter.minLossUsd.toFixed(2)}`,
    );
  }
  if (page.cursor) {
    conditions.push(
      sql`(${detectedSandwiches.blockTime}, ${detectedSandwiches.id}) < (${page.cursor.blockTime}, ${page.cursor.id})`,
    );
  }

  const rows = await db
    .select()
    .from(detectedSandwiches)
    .where(and(...conditions))
    .orderBy(desc(detectedSandwiches.blockTime), desc(detectedSandwiches.id))
    .limit(page.limit + 1);

  const hasMore = rows.length > page.limit;
  const data = hasMore ? rows.slice(0, page.limit) : rows;
  const last = data[data.length - 1];
  const nextCursor =
    hasMore && last
      ? { id: last.id.toString(), blockTime: last.blockTime.toISOString() }
      : null;

  return { data, nextCursor };
}

export async function getSandwichById(
  db: DbExecutor,
  id: bigint,
): Promise<SandwichRow | null> {
  const [row] = await db
    .select()
    .from(detectedSandwiches)
    .where(eq(detectedSandwiches.id, id))
    .limit(1);
  return row ?? null;
}

export async function getPoolSandwichStats(
  db: DbExecutor,
  pool: string,
  windowDays: number,
): Promise<{ count: number; avgLossUsd: number | null; lastSeen: Date | null }> {
  const since = new Date(Date.now() - windowDays * 86_400_000);
  const [row] = await db
    .select({
      count: sql<number>`COUNT(*)::int`,
      avgLossUsd: sql<string | null>`AVG(${detectedSandwiches.lossUsd})::text`,
      lastSeen: sql<Date | null>`MAX(${detectedSandwiches.blockTime})`,
    })
    .from(detectedSandwiches)
    .where(
      and(
        eq(detectedSandwiches.pool, pool),
        gte(detectedSandwiches.blockTime, since),
      ),
    );

  return {
    count: row?.count ?? 0,
    avgLossUsd: row?.avgLossUsd ? parseFloat(row.avgLossUsd) : null,
    lastSeen: row?.lastSeen ?? null,
  };
}

export async function getRecentSandwichesAcross(
  db: DbExecutor,
  limit: number,
): Promise<SandwichRow[]> {
  return db
    .select()
    .from(detectedSandwiches)
    .orderBy(desc(detectedSandwiches.blockTime))
    .limit(limit);
}

export async function getDailySandwichCountsForValidator(
  db: DbExecutor,
  voteAccount: string,
  days: number,
): Promise<Array<{ day: string; count: number; lossUsd: number }>> {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${detectedSandwiches.blockTime}), 'YYYY-MM-DD')`,
      count: sql<number>`COUNT(*)::int`,
      lossUsd: sql<string>`COALESCE(SUM(${detectedSandwiches.lossUsd}), 0)::text`,
    })
    .from(detectedSandwiches)
    .where(
      and(
        eq(detectedSandwiches.validatorVote, voteAccount),
        gte(detectedSandwiches.blockTime, since),
      ),
    )
    .groupBy(sql`date_trunc('day', ${detectedSandwiches.blockTime})`)
    .orderBy(sql`date_trunc('day', ${detectedSandwiches.blockTime})`);

  return rows.map((r) => ({
    day: r.day,
    count: r.count,
    lossUsd: parseFloat(r.lossUsd),
  }));
}

export async function deleteAlertsBefore(
  db: DbExecutor,
  before: Date,
): Promise<void> {
  await db.delete(alerts).where(lt(alerts.createdAt, before));
}
