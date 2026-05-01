CREATE TYPE "public"."scan_job_status" AS ENUM('pending', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."scan_status" AS ENUM('pending', 'scanning', 'complete', 'failed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alerts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"wallet" text NOT NULL,
	"sandwich_id" bigint,
	"kind" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "detected_sandwiches" ALTER COLUMN "validator_vote" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pools" ALTER COLUMN "token_a_mint" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pools" ALTER COLUMN "token_b_mint" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pools" ALTER COLUMN "sandwich_count_24h" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "pools" ALTER COLUMN "sandwich_count_7d" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "scan_jobs" ALTER COLUMN "status" SET DATA TYPE scan_job_status;--> statement-breakpoint
ALTER TABLE "scan_jobs" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "scan_jobs" ALTER COLUMN "progress_pct" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "scan_jobs" ALTER COLUMN "signatures_processed" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "scan_jobs" ALTER COLUMN "sandwiches_found" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "wallets" ALTER COLUMN "scan_status" SET DATA TYPE scan_status;--> statement-breakpoint
ALTER TABLE "wallets" ALTER COLUMN "total_tx_count" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "wallets" ALTER COLUMN "total_loss_usd" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "key_prefix" text NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "detected_sandwiches" ADD COLUMN "attacker_profit_raw" numeric(40, 0);--> statement-breakpoint
ALTER TABLE "detected_sandwiches" ADD COLUMN "failed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "detected_sandwiches" ADD COLUMN "is_known_bot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "detected_sandwiches" ADD COLUMN "known_bot_name" text;--> statement-breakpoint
ALTER TABLE "pools" ADD COLUMN "avg_loss_usd" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "pools" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "scan_jobs" ADD COLUMN "cursor" text;--> statement-breakpoint
ALTER TABLE "scan_jobs" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "validators" ADD COLUMN "total_extracted_usd" numeric(18, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "validators" ADD COLUMN "activated_stake" numeric(30, 0);--> statement-breakpoint
ALTER TABLE "validators" ADD COLUMN "commission" smallint;--> statement-breakpoint
ALTER TABLE "validators" ADD COLUMN "is_jito_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "validators" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "sandwich_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "first_attack_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "last_attack_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alerts" ADD CONSTRAINT "alerts_sandwich_id_detected_sandwiches_id_fk" FOREIGN KEY ("sandwich_id") REFERENCES "public"."detected_sandwiches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_alerts_wallet" ON "alerts" USING btree ("wallet","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_api_keys_prefix" ON "api_keys" USING btree ("key_prefix");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_block_time" ON "detected_sandwiches" USING btree ("block_time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pools_risk" ON "pools" USING btree ("risk_score");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scan_jobs_wallet" ON "scan_jobs" USING btree ("wallet","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scan_jobs_status" ON "scan_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_validators_jito" ON "validators" USING btree ("is_jito_enabled");