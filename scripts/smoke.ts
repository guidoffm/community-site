// Smoke-Test der Fachlogik gegen die laufende Dev-DB (und S3, falls konfiguriert):
//   npm run smoke
import sharp from "sharp";
import { eq, sql } from "drizzle-orm";
import { db, t } from "../src/db";
import { register } from "../src/services/users";
import { getCommunity, joinCommunity } from "../src/services/communities";
import { createEvent, getEvent, setRegistration } from "../src/services/events";
import { inbox, readMessage, replyToMessage, sendMessage, unreadCount } from "../src/services/messages";
import { eventPhotos, readImage, uploadImages, deleteImage } from "../src/services/images";
import { saveHomepage, viewHomepage } from "../src/services/homepages";
import { processOutbox } from "../src/services/outbox";
import type { Actor } from "../src/lib/auth/session";

const ok = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(`FEHLER: ${msg}`);
  console.log(`✓ ${msg}`);
};
const suffix = Date.now().toString(36);
const actor = (u: { id: string; email: string; name: string }): Actor => ({ userId: u.id, email: u.email, name: u.name });

const ossis = await getCommunity("ossis");
ok(ossis.title === "Ossis", "Beispiel-Community Ossis existiert");

const a = actor(await register({ name: "Anna Test", email: `anna-${suffix}@example.org`, password: "geheim123", communityIds: [ossis.id] }, "smoke"));
const b = actor(await register({ name: "Bernd Test", email: `bernd-${suffix}@example.org`, password: "geheim123" }, "smoke"));
await joinCommunity(b, ossis.id);
ok(true, "zwei Nutzer registriert, beide Mitglied bei Ossis");

const before = (await db().select({ n: sql<number>`count(*)::int` }).from(t.mailOutbox)).at(0)!.n;
const msg = await sendMessage(a, "ossis", { subject: "Hallo", body: "Wie geht's?", mode: "selected", recipientIds: [b.userId] });
ok((await unreadCount(b)) >= 1, "Nachricht kommt im Posteingang an (ungelesen)");
const read = await readMessage(b, msg.id);
ok(read.isRecipient && read.body === "Wie geht's?", "Empfänger kann Nachricht lesen");
ok((await inbox(b)).find((m) => m.id === msg.id)?.readAt, "Nachricht als gelesen markiert");
const reply = await replyToMessage(b, msg.id, { body: "Gut!", replyAll: false });
ok((await readMessage(a, reply.id)).parent?.id === msg.id, "Antwort mit Bezug zur Ursprungsnachricht");
await readMessage(a, msg.id).then(() => ok(true, "Absender sieht eigene Nachricht"));
const c = actor(await register({ name: "Carla Fremd", email: `carla-${suffix}@example.org`, password: "geheim123" }, "smoke"));
await readMessage(c, msg.id).then(() => ok(false, "Fremde dürfen nicht lesen"), () => ok(true, "Fremde können Nachricht nicht lesen"));

const start = new Date(Date.now() + 86_400_000);
const pad = (n: number) => String(n).padStart(2, "0");
const local = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T19:00`;
const ev = await createEvent(a, "ossis", { title: "Stammtisch", description: "Wir treffen uns.", location: "Leipzig", startsAt: local, endsAt: null });
await setRegistration(b, "ossis", ev.id, true);
const evA = await getEvent(a, "ossis", ev.id);
ok(evA.registrationCount === 1 && evA.registrations[0].name === "Bernd Test", "Organisator sieht Anmeldung mit Namen");
ok((await getEvent(b, "ossis", ev.id)).registrations.length === 0, "Teilnehmer sehen keine Namensliste");

const queued = await db().select().from(t.mailOutbox).where(sql`${t.mailOutbox.createdAt} >= now() - interval '1 minute'`);
ok(queued.some((m) => m.subject.startsWith("Neues Event") && m.attachments?.[0]?.filename === "event.ics"), "Event-Mail mit ICS-Anhang in der Outbox");
ok(queued.some((m) => m.subject.startsWith("Neue Nachricht")), "Nachrichten-Mail in der Outbox");
ok(queued.length > 0 && before >= 0, `${queued.length} Mails eingereiht`);
await processOutbox();
ok(true, "Outbox verarbeitet (MAIL_PROVIDER=" + process.env.MAIL_PROVIDER + ")");

// Event in die Vergangenheit verschieben → Fotos erlaubt
await db().update(t.events).set({ startsAt: new Date(Date.now() - 3_600_000) }).where(eq(t.events.id, ev.id));
const png = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#1f4e79" } }).jpeg().toBuffer();
const file = new File([new Uint8Array(png)], "foto.jpg", { type: "image/jpeg" });
const up = await uploadImages(b, { kind: "event", eventId: ev.id }, [file], "Schön war's");
ok(up.uploaded === 1 && up.errors.length === 0, "Teilnehmer lädt Event-Foto hoch");
await uploadImages(c, { kind: "event", eventId: ev.id }, [file], null).then(() => ok(false, "Nicht-Teilnehmer"), () => ok(true, "Nicht-Teilnehmer darf nicht hochladen"));
const [photo] = await eventPhotos(ev.id);
ok(/^[0-9a-f-]{36}$/.test(photo.id), `Foto hat UUID ${photo.id}`);
const thumb = await readImage(a, photo.id, "thumb");
const meta = await sharp(thumb.data).metadata();
ok(meta.format === "webp" && meta.width === 480, "Thumbnail 480px WebP aus dem Speicher gelesen");
ok((await readImage(b, photo.id, "full")).data.length > 0, "Vollbild lesbar");
await readImage(c, photo.id, "thumb").then(() => ok(false, "Fremde"), () => ok(true, "Fremde sehen Event-Fotos nicht"));

await saveHomepage(b, { title: "Berndis Seite", content: "Hallo https://example.org", visibility: "members" });
await uploadImages(b, { kind: "homepage" }, [file], "Ich");
ok((await viewHomepage(a, b.userId)).images.length === 1, "Mitglied gemeinsamer Community sieht Homepage + Bild");
await viewHomepage(c, b.userId).then(() => ok(false, "Fremde"), () => ok(true, "Fremde sehen Homepage (nur Mitglieder) nicht"));
await saveHomepage(b, { title: "Berndis Seite", content: "", visibility: "public" });
ok((await viewHomepage(null, b.userId)).title === "Berndis Seite", "Öffentliche Homepage ohne Login sichtbar");

await deleteImage(a, photo.id);
ok((await eventPhotos(ev.id)).length === 0, "Organisator löscht Event-Foto");
const pending = await db().select().from(t.storageDeletions);
ok(pending.length === 0, "Speicherobjekte gelöscht (keine offenen Löschungen)");

// Aufräumen
await db().delete(t.users).where(sql`${t.users.email} like ${"%-" + suffix + "@example.org"}`);
console.log("\nAlle Prüfungen bestanden.");
process.exit(0);
