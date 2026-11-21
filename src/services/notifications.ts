// Benachrichtigungs-Mails rendern und in die Outbox legen. Bewusst ohne Nachrichteninhalt:
// die Mail soll die Mitglieder auf die Plattform holen.
import { APP_NAME, APP_URL, IMPRINT_URL, OPERATOR_NAME, PRIVACY_URL, communityUrl, siteUrl } from "@/lib/domains";
import { formatEventRange } from "@/lib/dates";
import { buildIcs, eventUrl } from "@/lib/ics";
import { escapeHtml, teaser } from "@/lib/utils";
import { eventMapUrl } from "@/lib/maps";
import { enqueueMails, type OutgoingMail } from "./outbox";
import type { Db } from "@/db";

type Recipient = { email: string; name: string };
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function layout(heading: string, bodyHtml: string, cta: { label: string; url: string }) {
  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
  <h2 style="margin:0 0 16px">${escapeHtml(heading)}</h2>
  ${bodyHtml}
  <p style="margin:24px 0"><a href="${cta.url}" style="background:#1f4e79;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${escapeHtml(cta.label)}</a></p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
  <p style="color:#94a3b8;font-size:13px">Diese E-Mail wurde automatisch von ${escapeHtml(APP_NAME)} versandt (<a href="${APP_URL}" style="color:#94a3b8">${APP_URL.replace(/^https?:\/\//, "")}</a>).<br>
  ${escapeHtml(APP_NAME)} ist ein Angebot der ${escapeHtml(OPERATOR_NAME)} · <a href="${IMPRINT_URL}" style="color:#94a3b8">Impressum</a> · <a href="${PRIVACY_URL}" style="color:#94a3b8">Datenschutz</a></p>
</div>`;
}

const each = (rs: Recipient[], m: Omit<OutgoingMail, "to">): OutgoingMail[] => rs.map((r) => ({ ...m, to: { email: r.email, name: r.name } }));

export async function notifyNewMessage(
  tx: Tx,
  msg: { id: string; subject: string; senderName: string; communityName: string },
  recipients: Recipient[],
) {
  const url = siteUrl(`/messages/${msg.id}`);
  await enqueueMails(
    each(recipients, {
      subject: `Neue Nachricht von ${msg.senderName} (${msg.communityName})`,
      text: `${msg.senderName} hat dir in der Community „${msg.communityName}“ geschrieben.\n\nBetreff: ${msg.subject}\n\nNachricht lesen und antworten:\n${url}\n`,
      html: layout(
        "Du hast eine neue Nachricht",
        `<p><strong>${escapeHtml(msg.senderName)}</strong> hat dir in der Community <strong>${escapeHtml(msg.communityName)}</strong> geschrieben:</p>
         <p style="background:#f1f5f9;padding:12px 16px;border-radius:8px">Betreff: ${escapeHtml(msg.subject)}</p>`,
        { label: "Nachricht lesen & antworten", url },
      ),
    }),
    tx,
  );
}

type EventInfo = {
  id: string;
  title: string;
  description: string;
  location: string;
  mapUrl: string | null;
  startsAt: Date;
  endsAt: Date | null;
  updatedAt: Date;
  organizerName: string;
  communityName: string;
  communitySlug: string;
};

function whereRow(e: { location: string; mapUrl: string | null }) {
  return `<tr><td style="padding:4px 16px 4px 0;color:#64748b">Wo</td><td>${escapeHtml(e.location)} · <a href="${escapeHtml(eventMapUrl(e))}" style="color:#7c3aed">Karte öffnen</a></td></tr>`;
}

/** Organisator: jemand hat sich an- bzw. abgemeldet. */
export async function notifyOrganizerOfRegistration(
  tx: Tx,
  e: EventInfo,
  organizer: Recipient,
  participantName: string,
  registered: boolean,
  total: number,
) {
  const url = eventUrl(e.communitySlug, e.id);
  const when = formatEventRange(e.startsAt, e.endsAt);
  const zusagen = `${total} ${total === 1 ? "Zusage" : "Zusagen"}`;
  const what = registered ? "hat sich angemeldet" : "hat sich abgemeldet";
  await enqueueMails(
    [
      {
        to: { email: organizer.email, name: organizer.name },
        subject: `${registered ? "Neue Anmeldung" : "Abmeldung"}: ${participantName} – ${e.title} (jetzt ${zusagen})`,
        text: `Hallo ${organizer.name},\n\n${participantName} ${what} für dein Event „${e.title}“ (${when}).\n\nAktuell: ${zusagen}.\n\nTeilnehmerliste: ${url}\n`,
        html: layout(
          registered ? "🙋 Neue Anmeldung" : "Abmeldung",
          `<p>Hallo ${escapeHtml(organizer.name)},</p>
           <p><strong>${escapeHtml(participantName)}</strong> ${what} für dein Event <strong>${escapeHtml(e.title)}</strong> (${escapeHtml(when)}).</p>
           <p style="font-size:18px;background:#f3e8ff;color:#5b21b6;padding:10px 16px;border-radius:10px;display:inline-block">Aktuell: <strong>${zusagen}</strong></p>`,
          { label: "Teilnehmerliste ansehen", url },
        ),
      },
    ],
    tx,
  );
}

/** Bestätigung an Teilnehmer: Anmeldung (mit ICS) bzw. Abmeldung (mit Absage-ICS, entfernt den Kalendereintrag). */
export async function notifyRegistration(tx: Tx, e: EventInfo, user: Recipient, registered: boolean) {
  const url = eventUrl(e.communitySlug, e.id);
  const when = formatEventRange(e.startsAt, e.endsAt);
  const ics = Buffer.from(registered ? buildIcs({ ...e, url }) : buildIcs({ ...e, updatedAt: new Date(), url }, "CANCEL"));
  await enqueueMails(
    [
      registered
        ? {
            to: { email: user.email, name: user.name },
            subject: `Teilnahme bestätigt: ${e.title}`,
            text: `Hallo ${user.name},\n\ndu bist für „${e.title}“ in ${e.communityName} angemeldet.\n\nWann: ${when}\nWo: ${e.location}\nKarte: ${eventMapUrl(e)}\n\nDetails: ${url}\n\nDen Termin für deinen Kalender findest du im Anhang (event.ics).\n`,
            html: layout(
              `Du bist dabei: ${e.title}`,
              `<p>Hallo ${escapeHtml(user.name)}, deine Teilnahme ist bestätigt.</p>
               <table style="border-collapse:collapse">
                 <tr><td style="padding:4px 16px 4px 0;color:#64748b">Wann</td><td>${escapeHtml(when)}</td></tr>
                 ${whereRow(e)}
               </table>
               <p style="color:#64748b;font-size:14px">Den Termin für deinen Kalender findest du im Anhang (event.ics).</p>`,
              { label: "Zum Event", url },
            ),
            attachments: [{ filename: "event.ics", contentType: "text/calendar; charset=utf-8; method=PUBLISH", content: ics }],
          }
        : {
            to: { email: user.email, name: user.name },
            subject: `Abgemeldet: ${e.title}`,
            text: `Hallo ${user.name},\n\ndu hast dich von „${e.title}“ (${when}) abgemeldet. Mit der angehängten Datei entfernst du den Termin aus deinem Kalender.\n\n${url}\n`,
            html: layout(
              `Abgemeldet: ${e.title}`,
              `<p>Hallo ${escapeHtml(user.name)}, du hast dich von <strong>${escapeHtml(e.title)}</strong> (${escapeHtml(when)}) abgemeldet.</p>
               <p style="color:#64748b;font-size:14px">Mit der angehängten Datei (absage.ics) entfernst du den Termin aus deinem Kalender.</p>`,
              { label: "Zum Event", url },
            ),
            attachments: [{ filename: "absage.ics", contentType: "text/calendar; charset=utf-8; method=CANCEL", content: ics }],
          },
    ],
    tx,
  );
}

/** Erinnerung vor dem Event (3 Tage, 1 Tag, 4 Stunden). */
export async function notifyEventReminder(tx: Tx, e: EventInfo, user: Recipient, label: string) {
  const url = eventUrl(e.communitySlug, e.id);
  const when = formatEventRange(e.startsAt, e.endsAt);
  await enqueueMails(
    [
      {
        to: { email: user.email, name: user.name },
        subject: `Erinnerung: ${e.title} ist ${label}`,
        text: `Hallo ${user.name},\n\nkleine Erinnerung: „${e.title}“ in ${e.communityName} ist ${label}.\n\nWann: ${when}\nWo: ${e.location}\nKarte: ${eventMapUrl(e)}\n\nDetails: ${url}\n\nDoch keine Zeit? Du kannst dich auf der Event-Seite abmelden.\n`,
        html: layout(
          `⏰ ${e.title} ist ${label}`,
          `<p>Hallo ${escapeHtml(user.name)}, kleine Erinnerung an dein Event in <strong>${escapeHtml(e.communityName)}</strong>:</p>
           <table style="border-collapse:collapse">
             <tr><td style="padding:4px 16px 4px 0;color:#64748b">Wann</td><td>${escapeHtml(when)}</td></tr>
             ${whereRow(e)}
           </table>
           <p style="color:#64748b;font-size:14px">Doch keine Zeit? Du kannst dich auf der Event-Seite abmelden.</p>`,
          { label: "Zum Event", url },
        ),
      },
    ],
    tx,
  );
}

export async function notifyNewEvent(tx: Tx, e: EventInfo, recipients: Recipient[]) {
  const url = eventUrl(e.communitySlug, e.id);
  const ics = Buffer.from(buildIcs({ ...e, url }));
  const when = formatEventRange(e.startsAt, e.endsAt);
  await enqueueMails(
    each(recipients, {
      subject: `Neues Event in ${e.communityName}: ${e.title}`,
      text: `${e.organizerName} hat in „${e.communityName}“ ein neues Event erstellt.\n\n${e.title}\nWann: ${when}\nWo: ${e.location}\nKarte: ${eventMapUrl(e)}\n\n${teaser(e.description, 400)}\n\nDetails ansehen und teilnehmen:\n${url}\n\nDen Termin für deinen Kalender findest du im Anhang (event.ics).\n`,
      html: layout(
        e.title,
        `<p>${escapeHtml(e.organizerName)} hat in <strong>${escapeHtml(e.communityName)}</strong> ein neues Event erstellt.</p>
         <table style="border-collapse:collapse">
           <tr><td style="padding:4px 16px 4px 0;color:#64748b">Wann</td><td>${escapeHtml(when)}</td></tr>
           ${whereRow(e)}
         </table>
         <p>${escapeHtml(teaser(e.description))}</p>
         <p style="color:#64748b;font-size:14px">Den Termin für deinen Kalender findest du im Anhang (event.ics).</p>`,
        { label: "Details ansehen & teilnehmen", url },
      ),
      attachments: [{ filename: "event.ics", contentType: "text/calendar; charset=utf-8; method=PUBLISH", content: ics }],
    }),
    tx,
  );
}

export async function notifyEventCancelled(tx: Tx, e: EventInfo, recipients: Recipient[]) {
  const url = communityUrl(e.communitySlug);
  const ics = Buffer.from(buildIcs({ ...e, updatedAt: new Date(), url }, "CANCEL"));
  const when = formatEventRange(e.startsAt, e.endsAt);
  await enqueueMails(
    each(recipients, {
      subject: `Abgesagt: ${e.title}`,
      text: `Das Event „${e.title}“ am ${when} in der Community „${e.communityName}“ wurde vom Organisator abgesagt.\n\n${url}\n`,
      html: layout(
        `Abgesagt: ${e.title}`,
        `<p>Das Event <strong>${escapeHtml(e.title)}</strong> am ${escapeHtml(when)} in der Community ${escapeHtml(e.communityName)} wurde vom Organisator abgesagt.</p>`,
        { label: "Zur Community", url },
      ),
      attachments: [{ filename: "absage.ics", contentType: "text/calendar; charset=utf-8; method=CANCEL", content: ics }],
    }),
    tx,
  );
}

export async function notifyEmailVerification(tx: Tx, user: Recipient, token: string) {
  const url = siteUrl(`/verify?token=${encodeURIComponent(token)}`);
  await enqueueMails(
    [
      {
        to: { email: user.email, name: user.name },
        subject: `Bitte bestätige deine Registrierung bei ${APP_NAME}`,
        text: `Hallo ${user.name},\n\nbitte bestätige deine Registrierung bei ${APP_NAME} innerhalb von 24 Stunden:\n${url}\n\nOhne Bestätigung wird die Registrierung automatisch gelöscht. Falls du dich nicht registriert hast, ignoriere diese E-Mail einfach.\n`,
        html: layout(
          "Registrierung bestätigen",
          `<p>Hallo ${escapeHtml(user.name)},</p>
           <p>bitte bestätige deine Registrierung bei ${escapeHtml(APP_NAME)} <strong>innerhalb von 24 Stunden</strong>. Ohne Bestätigung wird die Registrierung automatisch gelöscht.</p>
           <p style="color:#64748b;font-size:14px">Falls du dich nicht registriert hast, ignoriere diese E-Mail einfach.</p>`,
          { label: "Registrierung bestätigen", url },
        ),
      },
    ],
    tx,
  );
}

export async function notifyAccountDeleted(tx: Tx, user: Recipient) {
  await enqueueMails(
    [
      {
        to: { email: user.email, name: user.name },
        subject: `Dein Konto bei ${APP_NAME} wurde gelöscht`,
        text: `Hallo ${user.name},\n\ndein Konto bei ${APP_NAME} und alle zugehörigen Daten (Mitgliedschaften, Nachrichten, Events, Homepage und Bilder) wurden gelöscht.\n\nSchade, dass du gehst – du kannst dich jederzeit neu registrieren:\n${siteUrl("/register")}\n`,
        html: layout(
          "Konto gelöscht",
          `<p>Hallo ${escapeHtml(user.name)},</p>
           <p>dein Konto bei ${escapeHtml(APP_NAME)} und deine Daten (Mitgliedschaften, Nachrichten, Homepage, Bilder und anstehende Events) wurden gelöscht. Vergangene Events, die du organisiert hast, bleiben ohne deinen Namen als „Gelöschter Benutzer“ erhalten.</p>
           <p>Schade, dass du gehst – du kannst dich jederzeit neu registrieren.</p>`,
          { label: "Zu " + APP_NAME, url: siteUrl("/") },
        ),
      },
    ],
    tx,
  );
}

export async function notifyPasswordReset(tx: Tx, user: Recipient, token: string) {
  const url = siteUrl(`/password/reset?token=${encodeURIComponent(token)}`);
  await enqueueMails(
    [
      {
        to: { email: user.email, name: user.name },
        subject: `Passwort zurücksetzen bei ${APP_NAME}`,
        text: `Hallo ${user.name},\n\nüber diesen Link kannst du innerhalb einer Stunde ein neues Passwort festlegen:\n${url}\n\nDu hast das nicht angefordert? Dann ignoriere diese E-Mail – dein Passwort bleibt unverändert.\n`,
        html: layout(
          "Passwort zurücksetzen",
          `<p>Hallo ${escapeHtml(user.name)},</p>
           <p>über den Button kannst du <strong>innerhalb einer Stunde</strong> ein neues Passwort festlegen.</p>
           <p style="color:#64748b;font-size:14px">Du hast das nicht angefordert? Dann ignoriere diese E-Mail – dein Passwort bleibt unverändert.</p>`,
          { label: "Neues Passwort festlegen", url },
        ),
      },
    ],
    tx,
  );
}

export async function notifyLoginCode(tx: Tx, user: Recipient, code: string) {
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  await enqueueMails(
    [
      {
        to: { email: user.email, name: user.name },
        subject: `${spaced} ist dein Anmeldecode für ${APP_NAME}`,
        text: `Hallo ${user.name},\n\ndein Anmeldecode lautet: ${spaced}\n\nEr ist 10 Minuten gültig. Du hast keinen Code angefordert? Dann ignoriere diese E-Mail.\n\nTipp: Mit einem Passkey (unter „Mein Konto“) meldest du dich künftig ganz ohne Code an.\n`,
        html: layout(
          "Dein Anmeldecode",
          `<p>Hallo ${escapeHtml(user.name)}, gib diesen Code auf der Anmeldeseite ein:</p>
           <p style="font-size:32px;font-weight:800;letter-spacing:6px;background:#f3e8ff;color:#5b21b6;padding:16px 24px;border-radius:12px;display:inline-block">${spaced}</p>
           <p style="color:#64748b;font-size:14px">Der Code ist 10 Minuten gültig. Du hast keinen Code angefordert? Dann ignoriere diese E-Mail.</p>`,
          { label: `Zu ${APP_NAME}`, url: siteUrl("/login") },
        ),
      },
    ],
    tx,
  );
}

// ---------------------------------------------------------------- Meldeverfahren (DSA)
const STATUS_TEXT: Record<string, string> = {
  removed: "Wir haben den Inhalt entfernt.",
  blocked: "Wir haben das verantwortliche Konto gesperrt.",
  dismissed: "Wir haben keinen Verstoß festgestellt; der Inhalt bleibt bestehen.",
};

export const reportMails = {
  /** Eingangsbestätigung (Art. 16 Abs. 4 DSA) */
  received(to: Recipient, id: string, label: string, reason: string): OutgoingMail[] {
    return [
      {
        to: { email: to.email, name: to.name },
        subject: `Deine Meldung ist eingegangen (${label})`,
        text: `Hallo ${to.name},\n\nvielen Dank für deine Meldung zu: ${label}\nGrund: ${reason}\nAktenzeichen: ${id}\n\nWir prüfen den Inhalt und informieren dich über unsere Entscheidung.\n`,
        html: layout(
          "Deine Meldung ist eingegangen",
          `<p>Hallo ${escapeHtml(to.name)}, vielen Dank für deine Meldung.</p>
           <table style="border-collapse:collapse">
             <tr><td style="padding:4px 16px 4px 0;color:#64748b">Inhalt</td><td>${escapeHtml(label)}</td></tr>
             <tr><td style="padding:4px 16px 4px 0;color:#64748b">Grund</td><td>${escapeHtml(reason)}</td></tr>
             <tr><td style="padding:4px 16px 4px 0;color:#64748b">Aktenzeichen</td><td>${escapeHtml(id)}</td></tr>
           </table>
           <p>Wir prüfen den Inhalt und informieren dich über unsere Entscheidung.</p>`,
          { label: `Zu ${APP_NAME}`, url: siteUrl("/") },
        ),
      },
    ];
  },
  adminNotice(admins: Recipient[], id: string, label: string, reason: string, details: string): OutgoingMail[] {
    const url = siteUrl("/admin/reports");
    return admins.map((a) => ({
      to: { email: a.email, name: a.name },
      subject: `Neue Meldung: ${label}`,
      text: `Neue Meldung (${id})\n\nInhalt: ${label}\nGrund: ${reason}\n\n${details}\n\nBearbeiten: ${url}\n`,
      html: layout(
        "🚩 Neue Meldung",
        `<p><strong>${escapeHtml(label)}</strong></p><p>Grund: ${escapeHtml(reason)}</p>
         <p style="background:#f1f5f9;padding:12px 16px;border-radius:8px;white-space:pre-wrap">${escapeHtml(details)}</p>`,
        { label: "Meldung bearbeiten", url },
      ),
    }));
  },
  /** Entscheidung an die meldende Person (Art. 16 Abs. 5 DSA) */
  decision(to: Recipient, label: string, status: string, note: string): OutgoingMail[] {
    return [
      {
        to: { email: to.email, name: to.name },
        subject: `Entscheidung zu deiner Meldung (${label})`,
        text: `Hallo ${to.name},\n\nwir haben deine Meldung zu „${label}“ geprüft. ${STATUS_TEXT[status]}\n\nBegründung: ${note}\n\nBei Fragen: mail@altiros.de\n`,
        html: layout(
          "Entscheidung zu deiner Meldung",
          `<p>Hallo ${escapeHtml(to.name)}, wir haben deine Meldung zu <strong>${escapeHtml(label)}</strong> geprüft.</p>
           <p><strong>${escapeHtml(STATUS_TEXT[status])}</strong></p>
           <p style="background:#f1f5f9;padding:12px 16px;border-radius:8px;white-space:pre-wrap">${escapeHtml(note)}</p>
           <p style="color:#64748b;font-size:14px">Bei Fragen: <a href="mailto:mail@altiros.de">mail@altiros.de</a></p>`,
          { label: `Zu ${APP_NAME}`, url: siteUrl("/") },
        ),
      },
    ];
  },
  /** Begründung an die betroffene Person (Art. 17 DSA) */
  statementOfReasons(to: Recipient, label: string, action: "remove" | "block", note: string): OutgoingMail[] {
    const what = action === "remove" ? `Wir haben folgenden Inhalt von dir entfernt: ${label}` : `Wir haben dein Konto gesperrt (Anlass: ${label}).`;
    return [
      {
        to: { email: to.email, name: to.name },
        subject: action === "remove" ? `Ein Inhalt von dir wurde entfernt` : `Dein Konto bei ${APP_NAME} wurde gesperrt`,
        text: `Hallo ${to.name},\n\n${what}\n\nBegründung: ${note}\n\nGrundlage sind unsere Nutzungsbedingungen (${siteUrl("/terms")}) bzw. geltendes Recht. Die Entscheidung wurde nach einer Meldung von einem Menschen getroffen, nicht automatisiert.\n\nWenn du die Entscheidung für falsch hältst, kannst du dich innerhalb von sechs Monaten unter mail@altiros.de beschweren; wir prüfen sie dann erneut.\n`,
        html: layout(
          action === "remove" ? "Ein Inhalt wurde entfernt" : "Dein Konto wurde gesperrt",
          `<p>Hallo ${escapeHtml(to.name)},</p><p>${escapeHtml(what)}</p>
           <p style="background:#f1f5f9;padding:12px 16px;border-radius:8px;white-space:pre-wrap"><strong>Begründung:</strong> ${escapeHtml(note)}</p>
           <p>Grundlage sind unsere <a href="${siteUrl("/terms")}">Nutzungsbedingungen</a> bzw. geltendes Recht. Die Entscheidung wurde nach einer Meldung von einem Menschen getroffen, nicht automatisiert.</p>
           <p>Wenn du die Entscheidung für falsch hältst, kannst du dich innerhalb von sechs Monaten unter <a href="mailto:mail@altiros.de">mail@altiros.de</a> beschweren; wir prüfen sie dann erneut.</p>`,
          { label: "Nutzungsbedingungen", url: siteUrl("/terms") },
        ),
      },
    ];
  },
};
