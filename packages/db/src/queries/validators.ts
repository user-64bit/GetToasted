import { and, desc, eq, gt, sql } from "drizzle-orm";
import type { DbExecutor } from "./types.js";
import { detectedSandwiches, validators } from "../schema.js";

export type ValidatorRow = typeof validators.$inferSelect;
export type ValidatorInsert = typeof validators.$inferInsert;

export async function upsertValidatorBatch(
  db: DbExecutor,
  rows: ValidatorInsert[],
): Promise<void> {
  if (rows.length === 0) return;
  await db.transaction(async (tx) => {
    for (const row of rows) {
      await tx
        .insert(validators)
        .values(row)
        .onConflictDoUpdate({
          target: validators.voteAccount,
          set: {
            identityAccount: sql`EXCLUDED.identity_account`,
            name: sql`EXCLUDED.name`,
            activatedStake: sql`EXCLUDED.activated_stake`,
            commission: sql`EXCLUDED.commission`,
            isJitoEnabled: sql`EXCLUDED.is_jito_enabled`,
            metadata: sql`EXCLUDED.metadata`,
            lastUpdatedAt: new Date(),
          },
        });
    }
  });
}

export async function recomputeValidatorSandwichStats(db: DbExecutor): Promise<number> {
  const result = await db.execute(sql`
    UPDATE validators v
    SET sandwich_count = COALESCE(s.cnt, 0),
        total_extracted_usd = COALESCE(s.total_loss, 0)
    FROM (
      SELECT validator_vote, COUNT(*)::int AS cnt, COALESCE(SUM(loss_usd), 0)::numeric(18,2) AS total_loss
      FROM detected_sandwiches
      WHERE validator_vote IS NOT NULL
      GROUP BY validator_vote
    ) s
    WHERE v.vote_account = s.validator_vote
  `);
  return Number((result as unknown as { count?: number }).count ?? 0);
}

export type ValidatorLeaderboardSort = "sandwiches" | "extracted_usd" | "sandwich_rate";

export async function getValidatorLeaderboard(
  db: DbExecutor,
  opts: {
    sort: ValidatorLeaderboardSort;
    jitoOnly?: boolean;
    limit: number;
    offset: number;
  },
): Promise<ValidatorRow[]> {
  const conditions = [];
  if (opts.jitoOnly) conditions.push(eq(validators.isJitoEnabled, true));
  conditions.push(gt(validators.sandwichCount, 0));

  let order;
  switch (opts.sort) {
    case "extracted_usd":
      order = desc(validators.totalExtractedUsd);
      break;
    case "sandwich_rate":
      order = desc(
        sql`CASE WHEN ${validators.activatedStake} > 0 THEN ${validators.sandwichCount}::numeric / ${validators.activatedStake} ELSE 0 END`,
      );
      break;
    default:
      order = desc(validators.sandwichCount);
  }

  return db
    .select()
    .from(validators)
    .where(and(...conditions))
    .orderBy(order)
    .limit(opts.limit)
    .offset(opts.offset);
}

export async function getValidator(
  db: DbExecutor,
  voteAccount: string,
): Promise<ValidatorRow | null> {
  const [row] = await db
    .select()
    .from(validators)
    .where(eq(validators.voteAccount, voteAccount))
    .limit(1);
  return row ?? null;
}

export async function getValidatorRecentSandwiches(
  db: DbExecutor,
  voteAccount: string,
  limit: number,
): Promise<typeof detectedSandwiches.$inferSelect[]> {
  return db
    .select()
    .from(detectedSandwiches)
    .where(eq(detectedSandwiches.validatorVote, voteAccount))
    .orderBy(desc(detectedSandwiches.blockTime))
    .limit(limit);
}
