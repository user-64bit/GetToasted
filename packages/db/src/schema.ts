import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  bigint,
  numeric,
  boolean,
  jsonb,
  index,
  uniqueIndex,
  bigserial,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  tier: text("tier").notNull().default("free"),
  stripeCustomer: text("stripe_customer"),
});

export const wallets = pgTable(
  "wallets",
  {
    address: text("address").primaryKey(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastScanAt: timestamp("last_scan_at", { withTimezone: true }),
    lastSignature: text("last_signature"),
    scanStatus: text("scan_status").notNull().default("pending"),
    totalTxCount: integer("total_tx_count").default(0),
    totalLossUsd: numeric("total_loss_usd", { precision: 18, scale: 2 }).default("0"),
    ownerUserId: uuid("owner_user_id").references(() => users.id),
  },
  (t) => [index("idx_wallets_scan_status").on(t.scanStatus)],
);

export const detectedSandwiches = pgTable(
  "detected_sandwiches",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    slot: bigint("slot", { mode: "bigint" }).notNull(),
    blockTime: timestamp("block_time", { withTimezone: true }).notNull(),
    pool: text("pool").notNull(),
    dex: text("dex").notNull(),
    attacker: text("attacker").notNull(),
    victimWallet: text("victim_wallet").notNull(),
    validatorVote: text("validator_vote").notNull(),
    frontSig: text("front_sig").notNull(),
    victimSig: text("victim_sig").notNull(),
    backSig: text("back_sig").notNull(),
    jitoBundled: boolean("jito_bundled").notNull().default(false),
    jitoTipLamports: bigint("jito_tip_lamports", { mode: "bigint" }),
    inputMint: text("input_mint").notNull(),
    outputMint: text("output_mint").notNull(),
    victimInAmt: numeric("victim_in_amt", { precision: 40, scale: 0 }).notNull(),
    victimOutAmt: numeric("victim_out_amt", { precision: 40, scale: 0 }).notNull(),
    counterfactualOutAmt: numeric("counterfactual_out_amt", { precision: 40, scale: 0 }),
    lossUsd: numeric("loss_usd", { precision: 18, scale: 2 }),
    confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull().default("1.00"),
    detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_victim_wallet").on(t.victimWallet, t.blockTime),
    index("idx_attacker").on(t.attacker, t.blockTime),
    index("idx_validator").on(t.validatorVote, t.blockTime),
    index("idx_pool").on(t.pool, t.blockTime),
    uniqueIndex("uniq_sandwich_sigs").on(t.victimSig, t.frontSig, t.backSig),
  ],
);

export const validators = pgTable(
  "validators",
  {
    voteAccount: text("vote_account").primaryKey(),
    identityAccount: text("identity_account").notNull(),
    name: text("name"),
    sandwichCount: integer("sandwich_count").notNull().default(0),
    lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (t) => [index("idx_validators_sandwich_count").on(t.sandwichCount)],
);

export const alertRules = pgTable("alert_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  walletAddress: text("wallet_address").notNull(),
  channel: text("channel").notNull(), // "email" | "webhook"
  destination: text("destination").notNull(),
  minLossUsd: numeric("min_loss_usd", { precision: 18, scale: 2 }).default("0"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    keyHash: text("key_hash").notNull().unique(),
    name: text("name").notNull(),
    rateLimit: integer("rate_limit").notNull().default(100),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_api_keys_owner").on(t.ownerUserId)],
);
