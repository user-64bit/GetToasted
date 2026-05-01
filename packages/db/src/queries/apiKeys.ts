import { and, desc, eq, isNull } from "drizzle-orm";
import type { DbExecutor } from "./types.js";
import { apiKeys, users, wallets } from "../schema.js";

export type ApiKeyRow = typeof apiKeys.$inferSelect;

export async function getOrCreateUserIdForWallet(
  db: DbExecutor,
  address: string,
): Promise<string> {
  return db.transaction(async (tx) => {
    await tx.insert(wallets).values({ address }).onConflictDoNothing();
    const [w] = await tx
      .select({ ownerUserId: wallets.ownerUserId })
      .from(wallets)
      .where(eq(wallets.address, address));
    if (w?.ownerUserId) return w.ownerUserId;
    const [u] = await tx.insert(users).values({}).returning({ id: users.id });
    if (!u) throw new Error("failed to create user");
    await tx
      .update(wallets)
      .set({ ownerUserId: u.id })
      .where(eq(wallets.address, address));
    return u.id;
  });
}

export async function createApiKey(
  db: DbExecutor,
  input: {
    ownerUserId: string;
    name: string;
    keyHash: string;
    keyPrefix: string;
    rateLimit?: number;
    expiresAt?: Date | null;
  },
): Promise<ApiKeyRow> {
  const [row] = await db
    .insert(apiKeys)
    .values({
      ownerUserId: input.ownerUserId,
      name: input.name,
      keyHash: input.keyHash,
      keyPrefix: input.keyPrefix,
      rateLimit: input.rateLimit ?? 100,
      expiresAt: input.expiresAt ?? null,
    })
    .returning();
  if (!row) throw new Error("failed to insert api key");
  return row;
}

export async function listApiKeysForUser(
  db: DbExecutor,
  ownerUserId: string,
): Promise<ApiKeyRow[]> {
  return db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.ownerUserId, ownerUserId))
    .orderBy(desc(apiKeys.createdAt));
}

export async function revokeApiKey(
  db: DbExecutor,
  ownerUserId: string,
  id: string,
): Promise<boolean> {
  const updated = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiKeys.id, id),
        eq(apiKeys.ownerUserId, ownerUserId),
        isNull(apiKeys.revokedAt),
      ),
    )
    .returning({ id: apiKeys.id });
  return updated.length > 0;
}

export async function getApiKeyByHash(
  db: DbExecutor,
  keyHash: string,
): Promise<ApiKeyRow | null> {
  const [row] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)))
    .limit(1);
  return row ?? null;
}

export async function touchApiKeyLastUsed(
  db: DbExecutor,
  id: string,
): Promise<void> {
  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, id));
}
