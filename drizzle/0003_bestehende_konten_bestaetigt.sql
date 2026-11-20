-- Konten aus der Zeit vor der E-Mail-Bestätigung gelten als bestätigt (sonst würde sie der Job unverified-cleanup löschen).
UPDATE "users" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL;
