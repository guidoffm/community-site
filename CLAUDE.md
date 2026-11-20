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
- Mehrere Replikas: Start-Migration und Jobs über Advisory-Locks (`withAdvisoryLock`), Rate-Limits in `rate_limit_hits`.
- Image nur `linux/arm64` mit lokalem Docker (`./docker-build.sh`). Deployment: `~/src/argocd/community-site`.
- Tests: `npm run smoke` gegen die Dev-DB (`npm run dev:db`).
- Dev-Postgres-Daten liegen unter `~/.local/share/community-site/dev-pg` (nicht im Projekt, sonst Reload-Schleife im Dev-Server).
