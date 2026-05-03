-- Layered detector rewrite — adds detection layer + loss method metadata.
-- Existing rows get detection_layer='legacy' so dashboards can distinguish
-- pre-rewrite detections from layered-classifier output. loss_confidence is
-- nullable for legacy rows; new rows always set it.

ALTER TABLE "detected_sandwiches" ADD COLUMN "detection_layer" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "detected_sandwiches" ADD COLUMN "loss_method" text;--> statement-breakpoint
ALTER TABLE "detected_sandwiches" ADD COLUMN "loss_confidence" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "detected_sandwiches" ADD COLUMN "loss_output_amount" numeric(40, 0);--> statement-breakpoint

-- Index on detection_layer so the dashboard can filter "confirmed only"
-- (L1+L2) cheaply. Suspected-tier views (L4) will be much higher-volume
-- once enabled, and filtering them out client-side would push way too
-- much data over the wire.
CREATE INDEX IF NOT EXISTS "idx_detection_layer" ON "detected_sandwiches" ("detection_layer", "block_time");--> statement-breakpoint
