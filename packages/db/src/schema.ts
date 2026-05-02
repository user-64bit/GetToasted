import {
  pgTable,
  pgEnum,
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
  smallint,
} from "drizzle-orm/pg-core";

export const scanStatusEnum = pgEnum("scan_status", [
  "pending",
  "scanning",
  "complete",
  "failed",
]);

export const scanJobStatusEnum = pgEnum("scan_job_status", [
  "pending",
  "running",
  "done",
  "failed",
]);

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
    scanStatus: scanStatusEnum("scan_status").notNull().default("pending"),
    totalTxCount: integer("total_tx_count").notNull().default(0),
    totalLossUsd: numeric("total_loss_usd", { precision: 18, scale: 2 }).notNull().default("0"),
    sandwichCount: integer("sandwich_count").notNull().default(0),
    firstAttackAt: timestamp("first_attack_at", { withTimezone: true }),
    lastAttackAt: timestamp("last_attack_at", { withTimezone: true }),
    ownerUserId: uuid("owner_user_id").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
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
    validatorVote: text("validator_vote"),
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
    attackerProfitRaw: numeric("attacker_profit_raw", { precision: 40, scale: 0 }),
    lossUsd: numeric("loss_usd", { precision: 18, scale: 2 }),
    confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull().default("1.00"),
    failed: boolean("failed").notNull().default(false),
    isKnownBot: boolean("is_known_bot").notNull().default(false),
    knownBotName: text("known_bot_name"),
    detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_victim_wallet").on(t.victimWallet, t.blockTime),
    index("idx_attacker").on(t.attacker, t.blockTime),
    index("idx_validator").on(t.validatorVote, t.blockTime),
    index("idx_pool").on(t.pool, t.blockTime),
    index("idx_block_time").on(t.blockTime),
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
    totalExtractedUsd: numeric("total_extracted_usd", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    activatedStake: numeric("activated_stake", { precision: 30, scale: 0 }),
    commission: smallint("commission"),
    isJitoEnabled: boolean("is_jito_enabled").notNull().default(false),
    metadata: jsonb("metadata"),
    lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("idx_validators_sandwich_count").on(t.sandwichCount),
    index("idx_validators_jito").on(t.isJitoEnabled),
  ],
);

export const alertRules = pgTable("alert_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  walletAddress: text("wallet_address").notNull(),
  channel: text("channel").notNull(),
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
    keyPrefix: text("key_prefix").notNull(),
    name: text("name").notNull(),
    rateLimit: integer("rate_limit").notNull().default(100),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_api_keys_owner").on(t.ownerUserId),
    index("idx_api_keys_prefix").on(t.keyPrefix),
  ],
);

export const pools = pgTable(
  "pools",
  {
    address: text("address").primaryKey(),
    dex: text("dex").notNull(),
    tokenAMint: text("token_a_mint"),
    tokenBMint: text("token_b_mint"),
    sandwichCount24h: integer("sandwich_count_24h").notNull().default(0),
    sandwichCount7d: integer("sandwich_count_7d").notNull().default(0),
    avgLossUsd: numeric("avg_loss_usd", { precision: 18, scale: 2 }),
    riskScore: numeric("risk_score", { precision: 3, scale: 2 }),
    lastRefreshed: timestamp("last_refreshed", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("idx_pools_risk").on(t.riskScore)],
);

export const scanJobs = pgTable(
  "scan_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    wallet: text("wallet")
      .notNull()
      .references(() => wallets.address),
    status: scanJobStatusEnum("status").notNull().default("pending"),
    progressPct: smallint("progress_pct").notNull().default(0),
    signaturesProcessed: integer("signatures_processed").notNull().default(0),
    sandwichesFound: integer("sandwiches_found").notNull().default(0),
    cursor: text("cursor"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_scan_jobs_wallet").on(t.wallet, t.createdAt),
    index("idx_scan_jobs_status").on(t.status),
  ],
);

export const alerts = pgTable(
  "alerts",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    wallet: text("wallet").notNull(),
    sandwichId: bigint("sandwich_id", { mode: "bigint" }).references(
      () => detectedSandwiches.id,
      { onDelete: "cascade" },
    ),
    kind: text("kind").notNull(),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_alerts_wallet").on(t.wallet, t.createdAt)],
);

export const systemConfig = pgTable("system_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
