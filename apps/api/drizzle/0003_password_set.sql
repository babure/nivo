ALTER TABLE "users" ADD COLUMN "password_set" boolean DEFAULT true NOT NULL;
--> Google-only accounts never chose a password; require set-password / email confirm for deletion
UPDATE "users" SET "password_set" = false WHERE "google_sub" IS NOT NULL;
