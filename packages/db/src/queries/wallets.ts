import { eq } from "drizzle-orm";
import type { DbExecutor } from "./types.js";
import { wallets } from "../schema.js";

export type WalletRow = typeof wallets.$inferSelect;
export type WalletInsert = typeof wallets.$inferInsert;
export type WalletScanStatus = WalletRow["scanStatus"];

export async function getWallet(db: DbExecutor, address: string): Promise<WalletRow | null> {
  const [row] = await db
    .select()
    .from(wallets)
    .where(eq(wallets.address, address))
    .limit(1);
  return row ?? null;
}

export async function upsertWalletPending(
  db: DbExecutor,
  address: string,
): Promise<WalletRow> {
  const [row] = await db
    .insert(wallets)
    .values({ address, scanStatus: "pending" })
    .onConflictDoUpdate({
      target: wallets.address,
      set: { scanStatus: "pending" },
    })
    .returning();
  return row!;
}

export async function setWalletScanStatus(
  db: DbExecutor,
  address: string,
  patch: {
    scanStatus: WalletScanStatus;
    lastScanAt?: Date;
    lastSignature?: string | null;
    totalTxCount?: number;
  },
): Promise<void> {
  await db.update(wallets).set(patch).where(eq(wallets.address, address));
}
