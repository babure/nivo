ALTER TABLE "users" ADD COLUMN "google_sub" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_google_sub_unique" ON "users" ("google_sub");
