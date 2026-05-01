import { desc, eq, sql } from "drizzle-orm";
import type { DbExecutor } from "./types.js";
import { scanJobs } from "../schema.js";

export type ScanJobRow = typeof scanJobs.$inferSelect;

export async function createScanJob(
  db: DbExecutor,
  wallet: string,
): Promise<ScanJobRow> {
  const [row] = await db
    .insert(scanJobs)
    .values({ wallet, status: "pending" })
    .returning();
  return row!;
}

export async function getScanJob(db: DbExecutor, id: string): Promise<ScanJobRow | null> {
  const [row] = await db.select().from(scanJobs).where(eq(scanJobs.id, id)).limit(1);
  return row ?? null;
}

export async function getLatestScanJobForWallet(
  db: DbExecutor,
  wallet: string,
): Promise<ScanJobRow | null> {
  const [row] = await db
    .select()
    .from(scanJobs)
    .where(eq(scanJobs.wallet, wallet))
    .orderBy(desc(scanJobs.createdAt))
    .limit(1);
  return row ?? null;
}

export async function startScanJob(db: DbExecutor, id: string): Promise<void> {
  await db
    .update(scanJobs)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(scanJobs.id, id));
}

export async function updateScanJobProgress(
  db: DbExecutor,
  id: string,
  patch: {
    progressPct?: number;
    signaturesProcessed?: number;
    sandwichesFound?: number;
    cursor?: string | null;
  },
): Promise<void> {
  await db
    .update(scanJobs)
    .set({
      ...(patch.progressPct !== undefined ? { progressPct: patch.progressPct } : {}),
      ...(patch.signaturesProcessed !== undefined
        ? { signaturesProcessed: patch.signaturesProcessed }
        : {}),
      ...(patch.sandwichesFound !== undefined
        ? { sandwichesFound: patch.sandwichesFound }
        : {}),
      ...(patch.cursor !== undefined ? { cursor: patch.cursor } : {}),
    })
    .where(eq(scanJobs.id, id));
}

export async function bumpScanJobProgress(
  db: DbExecutor,
  id: string,
  delta: { signatures: number; sandwiches: number },
  cursor: string | null,
): Promise<void> {
  await db
    .update(scanJobs)
    .set({
      signaturesProcessed: sql`${scanJobs.signaturesProcessed} + ${delta.signatures}`,
      sandwichesFound: sql`${scanJobs.sandwichesFound} + ${delta.sandwiches}`,
      cursor,
    })
    .where(eq(scanJobs.id, id));
}

export async function completeScanJob(db: DbExecutor, id: string): Promise<void> {
  await db
    .update(scanJobs)
    .set({ status: "done", progressPct: 100, completedAt: new Date() })
    .where(eq(scanJobs.id, id));
}

export async function failScanJob(
  db: DbExecutor,
  id: string,
  error: string,
): Promise<void> {
  await db
    .update(scanJobs)
    .set({ status: "failed", error, completedAt: new Date() })
    .where(eq(scanJobs.id, id));
}
