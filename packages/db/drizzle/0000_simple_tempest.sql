CREATE TABLE IF NOT EXISTS "alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"wallet_address" text NOT NULL,
	"channel" text NOT NULL,
	"destination" text NOT NULL,
	"min_loss_usd" numeric(18, 2) DEFAULT '0',
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"key_hash" text NOT NULL,
	"name" text NOT NULL,
	"rate_limit" integer DEFAULT 100 NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "detected_sandwiches" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"slot" bigint NOT NULL,
	"block_time" timestamp with time zone NOT NULL,
	"pool" text NOT NULL,
	"dex" text NOT NULL,
	"attacker" text NOT NULL,
	"victim_wallet" text NOT NULL,
	"validator_vote" text NOT NULL,
	"front_sig" text NOT NULL,
	"victim_sig" text NOT NULL,
	"back_sig" text NOT NULL,
	"jito_bundled" boolean DEFAULT false NOT NULL,
	"jito_tip_lamports" bigint,
	"input_mint" text NOT NULL,
	"output_mint" text NOT NULL,
	"victim_in_amt" numeric(40, 0) NOT NULL,
	"victim_out_amt" numeric(40, 0) NOT NULL,
	"counterfactual_out_amt" numeric(40, 0),
	"loss_usd" numeric(18, 2),
	"confidence" numeric(3, 2) DEFAULT '1.00' NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pools" (
	"address" text PRIMARY KEY NOT NULL,
	"dex" text NOT NULL,
	"token_a_mint" text NOT NULL,
	"token_b_mint" text NOT NULL,
	"sandwich_count_24h" integer DEFAULT 0,
	"sandwich_count_7d" integer DEFAULT 0,
	"risk_score" numeric(3, 2),
	"last_refreshed" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scan_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet" text NOT NULL,
	"status" text NOT NULL,
	"progress_pct" smallint DEFAULT 0,
	"signatures_processed" integer DEFAULT 0,
	"sandwiches_found" integer DEFAULT 0,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tier" text DEFAULT 'free' NOT NULL,
	"stripe_customer" text,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "validators" (
	"vote_account" text PRIMARY KEY NOT NULL,
	"identity_account" text NOT NULL,
	"name" text,
	"sandwich_count" integer DEFAULT 0 NOT NULL,
	"last_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallets" (
	"address" text PRIMARY KEY NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_scan_at" timestamp with time zone,
	"last_signature" text,
	"scan_status" text DEFAULT 'pending' NOT NULL,
	"total_tx_count" integer DEFAULT 0,
	"total_loss_usd" numeric(18, 2) DEFAULT '0',
	"owner_user_id" uuid
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scan_jobs" ADD CONSTRAINT "scan_jobs_wallet_wallets_address_fk" FOREIGN KEY ("wallet") REFERENCES "public"."wallets"("address") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wallets" ADD CONSTRAINT "wallets_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_api_keys_owner" ON "api_keys" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_victim_wallet" ON "detected_sandwiches" USING btree ("victim_wallet","block_time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_attacker" ON "detected_sandwiches" USING btree ("attacker","block_time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_validator" ON "detected_sandwiches" USING btree ("validator_vote","block_time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pool" ON "detected_sandwiches" USING btree ("pool","block_time");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_sandwich_sigs" ON "detected_sandwiches" USING btree ("victim_sig","front_sig","back_sig");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_validators_sandwich_count" ON "validators" USING btree ("sandwich_count");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wallets_scan_status" ON "wallets" USING btree ("scan_status");