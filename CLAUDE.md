# community-site – Hinweise für Claude

Architektur wie `simple-erp` (Next.js standalone, Drizzle/pg, eigene Sessions, Services-Schicht, Web/Worker-Rollen).

- Sprache der UI, Fehlermeldungen und Doku: Deutsch.
- Fachlogik gehört in `src/services/`; Server Actions (`src/app/actions/`) und Route-Handler rufen nur Services auf (`run()` aus `src/lib/forms.ts`).
- Berechtigungen immer im Service prüfen (`communityContext(actor, slug)` für Community-Mitgliedschaft, `isParticipant` für Event-Fotos, `canViewHomepage`). Seiten wandeln NOT_FOUND/FORBIDDEN per `orNotFound` in 404 um.
- Domains: Hauptseite `APP_URL` (www.15k.de), Communities als Subdomain `<slug>.ROOT_DOMAIN`. Routing in `src/proxy.ts` (Subdomain → intern `/c/<slug>/…`). Links immer über `siteUrl()` / `communityUrl()` aus `src/lib/domains.ts` bauen, nie `/c/…` verlinken. Session-Cookie gilt für `COOKIE_DOMAIN` (.15k.de).
- Mails nie direkt aus Requests versenden: `src/services/notifications.ts` rendert, `enqueueMails` legt in `mail_outbox` ab (in derselben Transaktion), der Worker (`APP_ROLE=worker|all`) verschickt. Benachrichtigungen enthalten bewusst keinen Nachrichtentext.
- Bilder: UUID wird beim Upload vergeben; Objekte `images/<uuid>/full|thumb` in S3 (MinIO) bzw. lokal (`UPLOAD_DIR`, nur Entwicklung). Löschen immer über `scheduleImageDeletion` (Transaktion) + `deleteScheduled`; der Job `storage-cleanup` holt Fehlschläge nach. Bilder werden nur über `/api/images/<uuid>` mit Rechteprüfung ausgeliefert.
- Formulare: `ActionForm` (onSubmit + startTransition) statt `<form action>` bei Eingabeformularen; einfache Buttons dürfen `<form action>` nutzen, Rückfragen per `data-confirm`.
- Schemaänderungen: `src/db/schema.ts` ändern → `npm run db:generate` → Migration einchecken. Nie Migrationen von Hand editieren (Ausnahme: Datenmigrationen per `drizzle-kit generate --custom`). Migrationen müssen **abwärtskompatibel** sein (Rolling Update, Expand/Contract).
- Registrierung: Konto ist bis zur E-Mail-Bestätigung gesperrt (`users.email_verified_at`), Mitgliedschaften erst nach Bestätigung (`email_verifications.community_ids`). Bestätigung per POST-Button (`/verify`), nicht per GET – Mail-Scanner öffnen Links vorab. Job `unverified-cleanup` löscht nach 24 h.
- Rollen: Site-Admin (`users.is_site_admin`) darf Communities anlegen; Vergabe nur über `SITE_ADMIN_EMAILS` (Cluster-ConfigMap, nicht im Code – keine personenbezogenen Daten im öffentlichen Repo). Community-Rollen `admin`/`member` in `memberships`.
- Konto löschen (`src/services/account.ts`): vergangene Events gehen an das Platzhalter-Konto `DELETED_USER_ID` („Gelöschter Benutzer“, per Migration angelegt, kein Login) – nie löschen oder als echten Nutzer behandeln.
- Anmeldung: Passkey zuerst (`src/services/passkeys.ts`, @simplewebauthn v13, RP-ID = ROOT_DOMAIN ohne Port, Challenge in `auth_challenges` + Cookie `c15k_wa`), dann E-Mail-Code (`login_codes`, Hash mit SESSION_SECRET, 5 Versuche), Passwort optional (`password_hash = "!"` = keins).
- Nutzungsbedingungen: Text in `src/components/terms-text.tsx`, Fassung `TERMS_VERSION` in `src/lib/terms.ts` – bei inhaltlicher Änderung erhöhen (alle müssen neu zustimmen, `requireActor` leitet auf `/terms/accept`). Meldeverfahren (DSA Art. 16/17) in `src/services/reports.ts`; neue Inhaltsarten dort in `describeTarget`/`decideReport` aufnehmen und einen „Melden“-Link anbieten.
- Mehrere Replikas: Start-Migration und Jobs über Advisory-Locks (`withAdvisoryLock`), Rate-Limits in `rate_limit_hits`.
- Image nur `linux/arm64` mit lokalem Docker (`./docker-build.sh`). Deployment: `~/src/argocd/community-site`.
- Tests: `npm run smoke` gegen die Dev-DB (`npm run dev:db`).
- Dev-Postgres-Daten liegen unter `~/.local/share/community-site/dev-pg` (nicht im Projekt, sonst Reload-Schleife im Dev-Server).
