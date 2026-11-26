ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_bootstrap" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "blocked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "consultancies" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
