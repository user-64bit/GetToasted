import { eq, sql } from "drizzle-orm";
import { systemConfig } from "../schema.js";
import type { DbExecutor } from "./types.js";

export async function getConfigValue(
  db: DbExecutor,
  key: string,
): Promise<string | null> {
  const rows = await db
    .select({ value: systemConfig.value })
    .from(systemConfig)
    .where(eq(systemConfig.key, key))
    .limit(1);
  return rows[0]?.value ?? null;
}

export async function setConfigValue(
  db: DbExecutor,
  key: string,
  value: string,
): Promise<void> {
  await db
    .insert(systemConfig)
    .values({ key, value })
    .onConflictDoUpdate({
      target: systemConfig.key,
      set: { value, updatedAt: sql`now()` },
    });
}

export const HELIUS_WEBHOOK_ID_KEY = "helius.webhookId";
