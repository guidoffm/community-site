// Smoke-Test der Fachlogik gegen die laufende Dev-DB (und S3, falls konfiguriert):
//   npm run smoke
import sharp from "sharp";
import { and, eq, sql } from "drizzle-orm";
import { db, t } from "../src/db";
import { DELETED_USER_ID } from "../src/db/schema";
import { authenticate, changePassword, deleteUnverifiedUsers, peekPasswordReset, peekVerification, register, requestLoginCode, requestPasswordReset, resetPassword, verifyEmail, verifyLoginCode } from "../src/services/users";
import { finishLogin, startLogin, startRegistration } from "../src/services/passkeys";
import { createCommunity, getCommunity, joinCommunity, updateCommunity } from "../src/services/communities";
import { createEvent, getEvent, setRegistration } from "../src/services/events";
import { inbox, readMessage, replyToMessage, sendMessage, unreadCount } from "../src/services/messages";
import { eventPhotos, readImage, uploadImages, deleteImage } from "../src/services/images";
import { saveHomepage, viewHomepage } from "../src/services/homepages";
import { processOutbox } from "../src/services/outbox";
import { sendEventReminders } from "../src/services/reminders";
import { deleteAccount } from "../src/services/account";
import type { Actor } from "../src/lib/auth/session";

const ok = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(`FEHLER: ${msg}`);
  console.log(`✓ ${msg}`);
};
const suffix = Date.now().toString(36);
const actor = (u: { id: string; email: string; name: string }): Actor => ({ userId: u.id, email: u.email, name: u.name, isSiteAdmin: false });

const ossis = await getCommunity("ossis");
ok(ossis.title === "Ossis", "Beispiel-Community Ossis existiert");

// --- Registrierung mit E-Mail-Bestätigung
const annaMail = `anna-${suffix}@example.org`;
const first = await register({ name: "Anna Test", email: annaMail, password: "geheim123", communityIds: [ossis.id] }, `smoke-${suffix}`);
ok(!first.user.emailVerifiedAt, "Registrierung legt unbestätigtes Konto an");
const memberBefore = await db().select().from(t.memberships).where(eq(t.memberships.userId, first.user.id));
ok(memberBefore.length === 0, "vor Bestätigung keine Community-Mitgliedschaft");
await authenticate(annaMail, "geheim123", `smoke-${suffix}`).then(() => ok(false, "Login unbestätigt"), (e) => ok(/bestätige/.test(e.message), "Login vor Bestätigung gesperrt"));
const mails = await db().select().from(t.mailOutbox).where(eq(t.mailOutbox.toEmail, annaMail));
ok(mails.some((m) => m.subject.includes("bestätige") && m.text.includes("/verify?token=")), "Bestätigungsmail mit Link in der Outbox");
const again = await register({ name: "Anna Test", email: annaMail, password: "geheim123", communityIds: [ossis.id] }, `smoke-${suffix}`);
ok(again.user.id === first.user.id && !(await peekVerification(first.token)), "erneute Registrierung: neuer Link, alter ungültig");
ok((await peekVerification(again.token))?.email === annaMail, "Bestätigungsseite erkennt gültigen Link");
const verified = await verifyEmail(again.token);
ok(verified.user.emailVerifiedAt, "E-Mail bestätigt");
await verifyEmail(again.token).then(() => ok(false, "Link zweimal"), () => ok(true, "Link nur einmal verwendbar"));
ok((await db().select().from(t.memberships).where(eq(t.memberships.userId, first.user.id))).length === 1, "nach Bestätigung Mitglied bei Ossis");
await authenticate(annaMail, "geheim123", `smoke-${suffix}`).then(() => ok(true, "Login nach Bestätigung möglich"));
await register({ name: "X", email: annaMail, password: "geheim123" }, `smoke2-${suffix}`).then(() => ok(false, "doppelt"), () => ok(true, "bestätigte Adresse nicht erneut registrierbar"));

// Unbestätigt + älter als 24 h → Job löscht
const old = await register({ name: "Otto Alt", email: `otto-${suffix}@example.org`, password: "geheim123" }, `smoke3-${suffix}`);
await db().update(t.users).set({ createdAt: new Date(Date.now() - 25 * 3_600_000) }).where(eq(t.users.id, old.user.id));
const fresh = await register({ name: "Frieda Neu", email: `frieda-${suffix}@example.org`, password: "geheim123" }, `smoke3-${suffix}`);
const cleaned = await deleteUnverifiedUsers();
const left = await db().select({ id: t.users.id }).from(t.users).where(sql`${t.users.id} in (${old.user.id}, ${fresh.user.id})`);
ok(cleaned.usersDeleted >= 1 && left.length === 1 && left[0].id === fresh.user.id, "Job löscht nur unbestätigte Konten älter als 24 h");

/** Registrieren + bestätigen (für die weiteren Tests) */
const registerVerified = async (name: string, email: string, communityIds: string[] = []) => {
  const r = await register({ name, email, password: "geheim123", communityIds }, `smoke-v-${suffix}`);
  return (await verifyEmail(r.token)).user;
};
const registerVerifiedEarly = async (email: string) => {
  const r = await register({ name: "Dora Fremd", email, password: "geheim123" }, `smoke-e-${suffix}`);
  return (await verifyEmail(r.token)).user;
};
const a = actor(verified.user);
await createCommunity(a, { title: "Nicht erlaubt" }).then(() => ok(false, "Nicht-Admin"), (e) => ok(/Site-Admins/.test(e.message), "Nur Site-Admins dürfen Communities anlegen"));
const adminCommunity = await createCommunity({ ...a, isSiteAdmin: true }, { title: `Smoke ${suffix}`, slug: `smoke-${suffix}` });
ok(adminCommunity.slug === `smoke-${suffix}`, "Site-Admin legt Community an");
const upd = await updateCommunity(a, adminCommunity.slug, { title: "Smoke neu", description: "Neue Beschreibung" });
ok(upd.description === "Neue Beschreibung" && upd.slug === adminCommunity.slug, "Community-Admin ändert Titel/Beschreibung (Slug bleibt)");
const outsider = actor(await registerVerifiedEarly(`dora-${suffix}@example.org`));
await updateCommunity(outsider, adminCommunity.slug, { title: "Hack", description: "" }).then(() => ok(false, "Fremde ändern"), () => ok(true, "Nicht-Admins dürfen nicht bearbeiten"));
ok((await updateCommunity({ ...outsider, isSiteAdmin: true }, adminCommunity.slug, { title: "Smoke SA", description: "x" })).title === "Smoke SA", "Site-Admin darf jede Community bearbeiten");
await db().delete(t.communities).where(eq(t.communities.id, adminCommunity.id));
const b = actor(await registerVerified("Bernd Test", `bernd-${suffix}@example.org`));
await joinCommunity(b, ossis.id);
ok(true, "zwei bestätigte Nutzer, beide Mitglied bei Ossis");

const before = (await db().select({ n: sql<number>`count(*)::int` }).from(t.mailOutbox)).at(0)!.n;
const e = actor(await registerVerified("Emil Test", `emil-${suffix}@example.org`, [ossis.id]));
const recipientsOf = async (id: string) =>
  (await db().select({ u: t.messageRecipients.userId }).from(t.messageRecipients).where(eq(t.messageRecipients.messageId, id))).map((r) => r.u).sort();
const multi = await sendMessage(a, "ossis", { subject: "Zwei", body: "An zwei", mode: "selected", recipientIds: [b.userId, e.userId] });
ok(JSON.stringify(await recipientsOf(multi.id)) === JSON.stringify([b.userId, e.userId].sort()), "Nachricht an mehrere ausgewählte Mitglieder");
const toAll = await sendMessage(a, "ossis", { subject: "Alle", body: "An alle", mode: "all", recipientIds: [] });
const allR = await recipientsOf(toAll.id);
ok(allR.includes(b.userId) && allR.includes(e.userId) && !allR.includes(a.userId), "Nachricht an alle Mitglieder (ohne Absender)");
await sendMessage(a, "ossis", { subject: "Leer", body: "x", mode: "selected", recipientIds: [] }).then(() => ok(false, "leer"), () => ok(true, "Auswahl ohne Empfänger wird abgelehnt"));
const msg = await sendMessage(a, "ossis", { subject: "Hallo", body: "Wie geht's?", mode: "selected", recipientIds: [b.userId] });
ok((await unreadCount(b)) >= 1, "Nachricht kommt im Posteingang an (ungelesen)");
const read = await readMessage(b, msg.id);
ok(read.isRecipient && read.body === "Wie geht's?", "Empfänger kann Nachricht lesen");
ok((await inbox(b)).find((m) => m.id === msg.id)?.readAt, "Nachricht als gelesen markiert");
const reply = await replyToMessage(b, msg.id, { body: "Gut!", replyAll: false });
ok((await readMessage(a, reply.id)).parent?.id === msg.id, "Antwort mit Bezug zur Ursprungsnachricht");
await readMessage(a, msg.id).then(() => ok(true, "Absender sieht eigene Nachricht"));
const c = actor(await registerVerified("Carla Fremd", `carla-${suffix}@example.org`));
await readMessage(c, msg.id).then(() => ok(false, "Fremde dürfen nicht lesen"), () => ok(true, "Fremde können Nachricht nicht lesen"));

const start = new Date(Date.now() + 86_400_000);
const pad = (n: number) => String(n).padStart(2, "0");
const local = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T19:00`;
const ev = await createEvent(a, "ossis", { title: "Stammtisch", description: "Wir treffen uns.", location: "Leipzig", startsAt: local, endsAt: null });
await setRegistration(b, "ossis", ev.id, true);
await setRegistration(b, "ossis", ev.id, true); // Doppelklick → keine zweite Mail
const regMails = await db().select().from(t.mailOutbox).where(and(eq(t.mailOutbox.toEmail, b.email), eq(t.mailOutbox.subject, "Teilnahme bestätigt: Stammtisch")));
ok(regMails.length === 1 && regMails[0].attachments?.[0]?.filename === "event.ics", "Anmeldebestätigung mit ICS (genau einmal)");
const regIcs = Buffer.from(regMails[0].attachments![0].contentBase64, "base64").toString().replace(/\r\n /g, "");
ok(regIcs.includes("Karte: https://www.google.com/maps/search/") && regMails[0].text.includes("Karte: "), "Karten-Link in Mail und ICS");
const orgMails = await db().select().from(t.mailOutbox).where(and(eq(t.mailOutbox.toEmail, a.email), sql`${t.mailOutbox.subject} like 'Neue Anmeldung: Bernd Test – Stammtisch%'`));
ok(orgMails.length === 1 && orgMails[0].subject.includes("jetzt 1 Zusage") && !orgMails[0].text.includes(b.email), "Organisator bekommt Mail bei Anmeldung (genau einmal, ohne Teilnehmer-Adresse)");
await setRegistration(b, "ossis", ev.id, false);
ok((await db().select().from(t.mailOutbox).where(and(eq(t.mailOutbox.toEmail, a.email), sql`${t.mailOutbox.subject} like 'Abmeldung: Bernd Test – Stammtisch%'`))).length === 1, "Organisator bekommt Mail bei Abmeldung");
const offMails = await db().select().from(t.mailOutbox).where(and(eq(t.mailOutbox.toEmail, b.email), eq(t.mailOutbox.subject, "Abgemeldet: Stammtisch")));
ok(offMails.length === 1 && Buffer.from(offMails[0].attachments![0].contentBase64, "base64").toString().includes("METHOD:CANCEL"), "Abmeldung mit Absage-ICS");
await setRegistration(b, "ossis", ev.id, true);
const evMap = await createEvent(a, "ossis", { title: "Mit Karte", description: "x", location: "Leipzig", mapUrl: "https://www.openstreetmap.org/#map=12/51.34/12.37", startsAt: local, endsAt: null });
ok(evMap.mapUrl === "https://www.openstreetmap.org/#map=12/51.34/12.37", "eigener Karten-Link wird gespeichert");
await createEvent(a, "ossis", { title: "Kaputt", description: "x", location: "Leipzig", mapUrl: "javascript:alert(1)", startsAt: local, endsAt: null }).then(() => ok(false, "js-Link"), () => ok(true, "unsicherer Karten-Link abgelehnt"));
await db().delete(t.events).where(eq(t.events.id, evMap.id));
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

// --- Passwort zurücksetzen / ändern
const none = await requestPasswordReset("gibt-es-nicht@example.org", `smoke-pw-${suffix}`);
ok(!none.token, "Reset für unbekannte Adresse: keine Mail, gleiche Antwort");
const pr = await requestPasswordReset(b.email, `smoke-pw-${suffix}`);
ok(pr.token && (await peekPasswordReset(pr.token))?.email === b.email, "Reset-Link für bekanntes Konto");
const prMail = (await db().select().from(t.mailOutbox).where(eq(t.mailOutbox.toEmail, b.email))).find((m) => m.subject.startsWith("Passwort zurücksetzen"));
ok(prMail?.text.includes("/password/reset?token=") && prMail.text.includes("Impressum: ") && prMail.html?.includes("Datenschutz"), "Reset-Mail mit Link und Pflichtangaben");
await resetPassword(pr.token!, "kurz").then(() => ok(false, "kurz"), () => ok(true, "zu kurzes Passwort abgelehnt"));
await resetPassword(pr.token!, "neuesPasswort1");
await authenticate(b.email, "neuesPasswort1", `smoke-pw-${suffix}`).then(() => ok(true, "Login mit neuem Passwort"));
await authenticate(b.email, "geheim123", `smoke-pw2-${suffix}`).then(() => ok(false, "altes Passwort"), () => ok(true, "altes Passwort ungültig"));
await resetPassword(pr.token!, "nochmal123").then(() => ok(false, "Link zweimal"), () => ok(true, "Reset-Link nur einmal verwendbar"));
const bUser = await db().query.users.findFirst({ where: eq(t.users.id, b.userId) });
ok(bUser?.passwordChangedAt, "ältere Sitzungen werden ungültig (passwordChangedAt)");
await changePassword(b.userId, "falsch", "egal12345").then(() => ok(false, "falsch"), () => ok(true, "Passwort ändern mit falschem aktuellem Passwort abgelehnt"));
await changePassword(b.userId, "neuesPasswort1", "geheim123");
await authenticate(b.email, "geheim123", `smoke-pw3-${suffix}`).then(() => ok(true, "Passwort geändert"));

// --- Ohne Passwort: Registrierung, E-Mail-Code, Passkey-Optionen
const pwless = await register({ name: "Paula Passkey", email: `paula-${suffix}@example.org`, password: "", communityIds: [] }, `smoke-pl-${suffix}`);
const paula = actor((await verifyEmail(pwless.token)).user);
ok(pwless.user.passwordHash === "!", "Registrierung ohne Passwort möglich");
await authenticate(paula.email, "!", `smoke-pl-${suffix}`).then(() => ok(false, "kein Passwort"), () => ok(true, "ohne Passwort kein Passwort-Login"));
ok(!(await requestLoginCode("unbekannt@example.org", `smoke-pl-${suffix}`)).code, "Code für unbekannte Adresse: keine Mail, gleiche Antwort");
const lc = await requestLoginCode(paula.email, `smoke-pl-${suffix}`);
ok(lc.code && /^\d{6}$/.test(lc.code), "6-stelliger Code angefordert");
const lcMail = (await db().select().from(t.mailOutbox).where(eq(t.mailOutbox.toEmail, paula.email))).find((m) => m.subject.includes("Anmeldecode"));
ok(lcMail && lcMail.text.includes(`${lc.code!.slice(0, 3)} ${lc.code!.slice(3)}`), "Code-Mail verschickt");
const wrong = lc.code === "000000" ? "111111" : "000000";
await verifyLoginCode(paula.email, wrong, `smoke-pl-${suffix}`).then(() => ok(false, "falscher Code"), () => ok(true, "falscher Code abgelehnt"));
ok((await verifyLoginCode(paula.email, `${lc.code!.slice(0, 3)} ${lc.code!.slice(3)}`, `smoke-pl-${suffix}`)).id === paula.userId, "Anmeldung mit Code (auch mit Leerzeichen)");
await verifyLoginCode(paula.email, lc.code!, `smoke-pl-${suffix}`).then(() => ok(false, "Code zweimal"), () => ok(true, "Code nur einmal verwendbar"));
const lc2 = await requestLoginCode(paula.email, `smoke-pl2-${suffix}`);
for (let i = 0; i < 5; i++) await verifyLoginCode(paula.email, lc2.code === "000000" ? "111111" : "000000", `smoke-pl-x${i}-${suffix}`).catch(() => null);
await verifyLoginCode(paula.email, lc2.code!, `smoke-pl-y-${suffix}`).then(() => ok(false, "nach 5 Fehlversuchen"), () => ok(true, "Code nach 5 Fehlversuchen gesperrt"));
await changePassword(paula.userId, "", "erstesPasswort1");
await authenticate(paula.email, "erstesPasswort1", `smoke-pl3-${suffix}`).then(() => ok(true, "Passwort nachträglich festlegen ohne altes Passwort"));
const reg = await startRegistration(paula);
ok(reg.options.rp.id === "lvh.me" && reg.options.authenticatorSelection?.residentKey === "required", `Passkey-Optionen: RP ${reg.options.rp.id}, Discoverable`);
const lo = await startLogin();
await finishLogin(lo.challengeId, { id: "unbekannt", rawId: "unbekannt", type: "public-key", clientExtensionResults: {}, response: { clientDataJSON: "", authenticatorData: "", signature: "" } } as never).then(() => ok(false, "unbekannter Passkey"), (e) => ok(/nicht \(mehr\) hinterlegt/.test(e.message), "unbekannter Passkey abgelehnt"));
await finishLogin(lo.challengeId, {} as never).then(() => ok(false, "Challenge zweimal"), (e) => ok(/abgelaufen/.test(e.message), "Challenge nur einmal verwendbar"));

// --- Erinnerungen
const remEv = await createEvent(a, "ossis", { title: "Erinnerungstest", description: "x", location: "Leipzig", startsAt: local, endsAt: null });
await setRegistration(b, "ossis", remEv.id, true);
await setRegistration(e, "ossis", remEv.id, true);
const H = 3_600_000;
// Event in 70 h; b hat sich vor 5 Tagen angemeldet, e erst vor 1 h (innerhalb des 3-Tage-Fensters)
await db().update(t.events).set({ startsAt: new Date(Date.now() + 70 * H), createdAt: new Date(Date.now() - 6 * 24 * H) }).where(eq(t.events.id, remEv.id));
await db().update(t.eventRegistrations).set({ createdAt: new Date(Date.now() - 5 * 24 * H) }).where(and(eq(t.eventRegistrations.eventId, remEv.id), eq(t.eventRegistrations.userId, b.userId)));
await db().update(t.eventRegistrations).set({ createdAt: new Date(Date.now() - 1 * H) }).where(and(eq(t.eventRegistrations.eventId, remEv.id), eq(t.eventRegistrations.userId, e.userId)));
const remKinds = async () => (await db().select().from(t.eventReminders).where(eq(t.eventReminders.eventId, remEv.id))).map((r) => `${r.userId === b.userId ? "b" : r.userId === a.userId ? "a" : "e"}:${r.kind}`).sort();
await sendEventReminders();
ok(JSON.stringify(await remKinds()) === JSON.stringify(["a:3d", "b:3d"]), "3-Tage-Erinnerung an Teilnehmer + Organisator, nicht an frisch Angemeldete");
await sendEventReminders();
ok((await remKinds()).length === 2, "keine doppelte Erinnerung beim nächsten Lauf");
/** Zeit vorspulen: Beginn rückt näher, Anmeldungen/Erstellung verschieben sich mit (wie in echt). */
const advance = async (hours: number) => {
  const d = sql`make_interval(hours => ${hours})`;
  await db().execute(sql`update events set starts_at = starts_at - ${d}, created_at = created_at - ${d} where id = ${remEv.id}`);
  await db().execute(sql`update event_registrations set created_at = created_at - ${d} where event_id = ${remEv.id}`);
};
await advance(50); // Beginn in 20 h
await sendEventReminders();
ok(JSON.stringify(await remKinds()) === JSON.stringify(["a:1d", "a:3d", "b:1d", "b:3d", "e:1d"]), "1-Tag-Erinnerung an alle");
await advance(17); // Beginn in 3 h
await sendEventReminders();
ok((await remKinds()).filter((k) => k.endsWith(":4h")).length === 3, "4-Stunden-Erinnerung an alle");
const remMail = (await db().select().from(t.mailOutbox).where(eq(t.mailOutbox.toEmail, b.email))).find((m) => m.subject === "Erinnerung: Erinnerungstest ist in 4 Stunden");
ok(remMail && remMail.text.includes("Karte: "), "Erinnerungsmail mit Ort und Karten-Link");
await db().delete(t.events).where(eq(t.events.id, remEv.id));

// --- Konto löschen
const del = actor(await registerVerified("Gustav Weg", `gustav-${suffix}@example.org`, [ossis.id]));
await saveHomepage(del, { title: "Gustavs Seite", content: "", visibility: "public" });
await uploadImages(del, { kind: "homepage" }, [file], null);
const pastEv = await createEvent(del, "ossis", { title: "Vorbei", description: "x", location: "Dresden", startsAt: local, endsAt: null });
const futureEv = await createEvent(del, "ossis", { title: "Kommt noch", description: "x", location: "Dresden", startsAt: local, endsAt: null });
await setRegistration(b, "ossis", futureEv.id, true);
await setRegistration(b, "ossis", pastEv.id, true);
await db().update(t.events).set({ startsAt: new Date(Date.now() - 3_600_000) }).where(eq(t.events.id, pastEv.id));
ok((await uploadImages(b, { kind: "event", eventId: pastEv.id }, [file], null)).uploaded === 1, "Teilnehmer lädt Foto ins Event des späteren Löschers");
await deleteAccount(del, "falsch", "smoke").then(() => ok(false, "falsches Passwort"), () => ok(true, "Konto löschen mit falschem Passwort abgelehnt"));
await deleteAccount(del, "geheim123", "smoke");
ok(!(await db().query.users.findFirst({ where: eq(t.users.id, del.userId) })), "Konto gelöscht");
ok((await db().select().from(t.events).where(eq(t.events.organizerId, del.userId))).length === 0, "keine Events mehr am gelöschten Konto");
const kept = await db().query.events.findFirst({ where: eq(t.events.id, pastEv.id) });
ok(kept?.organizerId === DELETED_USER_ID, "vergangenes Event bleibt, Organisator „Gelöschter Benutzer“");
ok((await getEvent(b, "ossis", pastEv.id)).organizer.name === "Gelöschter Benutzer", "Event-Seite zeigt „Gelöschter Benutzer“");
ok((await eventPhotos(pastEv.id)).length === 1, "Fotos anderer im vergangenen Event bleiben erhalten");
ok(!(await db().query.events.findFirst({ where: eq(t.events.id, futureEv.id) })), "anstehendes Event abgesagt (gelöscht)");
await authenticate("geloeschter-benutzer@invalid", "!", "smoke").then(() => ok(false, "Platzhalter-Login"), () => ok(true, "Platzhalter-Konto kann sich nicht anmelden"));
ok((await db().select().from(t.images).where(eq(t.images.uploaderId, del.userId))).length === 0, "eigene Bilder gelöscht");
await db().delete(t.events).where(eq(t.events.id, pastEv.id)); // Testdaten
ok((await db().select().from(t.storageDeletions)).length === 0, "Bild-Objekte im Speicher gelöscht");
const gone = await db().select().from(t.mailOutbox).where(sql`${t.mailOutbox.createdAt} >= now() - interval '1 minute'`);
ok(gone.some((m) => m.toEmail === `bernd-${suffix}@example.org` && m.subject === "Abgesagt: Kommt noch"), "Angemeldete erhalten Absage für anstehendes Event");
ok(gone.some((m) => m.toEmail === `gustav-${suffix}@example.org` && m.subject.includes("gelöscht")), "Bestätigungsmail über die Löschung");

// Aufräumen
await db().delete(t.users).where(sql`${t.users.email} like ${"%-" + suffix + "@example.org"}`);
console.log("\nAlle Prüfungen bestanden.");
process.exit(0);
