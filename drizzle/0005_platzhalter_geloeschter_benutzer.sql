-- Platzhalter-Konto „Gelöschter Benutzer“: übernimmt vergangene Events gelöschter Konten. Kein Login (kein gültiger Passwort-Hash).
INSERT INTO "users" ("id", "email", "name", "password_hash", "email_verified_at")
VALUES ('00000000-0000-0000-0000-00000000dead', 'geloeschter-benutzer@invalid', 'Gelöschter Benutzer', '!', now())
ON CONFLICT ("id") DO NOTHING;
