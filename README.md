# community-site (15k)

Plattform für Personengruppen: Communities anlegen und beitreten, Mitglieder anschreiben, Events organisieren, Fotos teilen.

- **Einstieg:** `https://www.15k.de` – jede Community unter eigener Subdomain, z. B. **https://ossis.15k.de**
- **Registrierung** mit Beitritt zu einer oder mehreren Communities; Bestätigung per E-Mail-Link innerhalb von 24 h, sonst löscht der Job `unverified-cleanup` das Konto
- **Community-Verwaltung** (`<slug>.15k.de/settings`): Beitrittsmodus offen / auf Anfrage / nur mit Einladung, Beitrittsanfragen, Einladungen per E-Mail oder teilbarem Link, Mitglieder und Admin-Rollen, Logo und Titelbild
- **Nachrichten** innerhalb einer Community an alle oder ausgewählte Mitglieder, mit Antworten, einzeln oder per Mehrfachauswahl löschbar (jede Seite löscht ihre Kopie); Empfänger werden per E-Mail benachrichtigt (ohne Inhalt – gelesen wird auf der Website)
- **Events** mit Titel, Beschreibung, Ort und Datum; alle Mitglieder werden per E-Mail informiert (inkl. `.ics`-Anhang), Anmeldung zur Teilnahme mit Bestätigungsmail und `.ics` (Abmeldung entfernt den Kalendereintrag), Karten-Link zum Ort, Erinnerungen 3 Tage, 1 Tag und 4 Stunden vorher (Job `event-reminders`), Teilnehmerlimit mit Warteliste und automatischem Nachrücken, Begleitpersonen (bis 5), Bearbeiten mit Änderungsmail und aktualisierter `.ics`, Organisator sieht Teilnehmerliste und bekommt bei jeder An-/Abmeldung eine E-Mail mit der aktuellen Zahl, Download als `.ics`, Absage mit Benachrichtigung
- **Event-Fotos:** nach Beginn des Events können Teilnehmer Fotos hochladen; sichtbar nur für Teilnehmer
- **Nutzungsbedingungen** (`/terms`, Zustimmung und Altersbestätigung ab 16 bei der Registrierung, Neuzustimmung bei neuer Fassung) und **Meldeverfahren nach DSA** („Melden“ an allen Inhalten, `/admin/reports` für Site-Admins: entfernen, Konto sperren, abweisen – mit Eingangsbestätigung, Entscheidung und Begründung per E-Mail)
- **Rechtliches:** Impressum und Datenschutzerklärung der Betreiberin (Altiros GmbH) in jeder Fußzeile, bei der Registrierung und in jeder E-Mail
- **Anmeldung:** bevorzugt per Passkey (WebAuthn, RP `15k.de`), alternativ Einmal-Code per E-Mail (10 min), Passwort optional
- **Passwort vergessen:** Link per E-Mail (1 h gültig, einmalig); Passwort ändern unter „Mein Konto“
- **Mein Konto** (`/account`): Konto mit Passwort löschen – persönliche Daten werden entfernt, anstehende eigene Events abgesagt, vergangene bleiben als „Gelöschter Benutzer“ erhalten
- **Homepage** je Mitglied mit Text und Bildergalerie, sichtbar für Mitglieder gemeinsamer Communities oder öffentlich
- **Bilder:** Thumbnails (WebP) in der Übersicht, Lightbox mit voller Größe; EXIF/GPS wird entfernt; Speicherung in S3-kompatiblem Speicher (MinIO), jedes Bild mit UUID

## Architektur

Wie [simple-erp](https://github.com/altiros/simple-erp): Next.js 16 (standalone), Drizzle ORM + PostgreSQL, eigene JWT-Sessions (`jose`), Fachlogik in `src/services/`, Tailwind 4.

| Rolle (`APP_ROLE`) | Aufgabe |
| --- | --- |
| `web` | Benutzeranfragen (mehrere Replikas) |
| `worker` | Mail-Outbox verschicken, Jobs (`POST /api/jobs/run?job=…`, aufgerufen von Kubernetes-CronJobs) |
| `all` | Entwicklung: beides in einem Prozess |

Beim Start migriert die App die Datenbank (`drizzle/`, Advisory-Lock). Health-Check: `GET /api/health`.

## Entwicklung

```bash
npm install
cp .env.example .env            # SESSION_SECRET setzen
npm run dev:db                  # Postgres ohne Docker (Port 54330), eigenes Terminal
docker compose up -d            # optional: MinIO für Bilder (sonst S3_BUCKET leeren → lokales ./uploads)
npm run dev                     # http://www.lvh.me:3000 bzw. http://ossis.lvh.me:3000
npm run smoke                   # Smoke-Test der Fachlogik
```

`lvh.me` und alle Subdomains zeigen auf `127.0.0.1` – so funktionieren Community-Subdomains und das gemeinsame Login-Cookie lokal.

## Konfiguration

Siehe [.env.example](.env.example). Wichtig im Betrieb:

| Variable | Beispiel |
| --- | --- |
| `APP_URL` | `https://www.15k.de` |
| `ROOT_DOMAIN` | `15k.de` |
| `COOKIE_DOMAIN` | `.15k.de` |
| `DATABASE_URL` | `postgresql://…` |
| `SESSION_SECRET`, `JOB_TOKEN` | zufällig, ≥ 32 Zeichen |
| `MAIL_PROVIDER` | `smtp` (Brevo-Relay) / `brevo` / `log` |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | MinIO im Cluster |

## Deployment

Image (nur `linux/arm64`): `./docker-build.sh` → `ghcr.io/guidoffm/community-site`. Kubernetes-Manifeste (ArgoCD) im Cluster-Repo unter `community-site/`; Ingress über Cloudflare-Tunnel für `www.15k.de` und `*.15k.de`.

## Lizenz

[Apache License 2.0](LICENSE)
