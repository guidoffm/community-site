// Benachrichtigungs-Mails rendern und in die Outbox legen. Bewusst ohne Nachrichteninhalt:
// die Mail soll die Mitglieder auf die Plattform holen.
import { APP_NAME, APP_URL, communityUrl, siteUrl } from "@/lib/domains";
import { formatEventRange } from "@/lib/dates";
import { buildIcs, eventUrl } from "@/lib/ics";
import { escapeHtml, teaser } from "@/lib/utils";
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
  <p style="color:#94a3b8;font-size:13px">Diese E-Mail wurde automatisch von ${escapeHtml(APP_NAME)} versandt (<a href="${APP_URL}" style="color:#94a3b8">${APP_URL.replace(/^https?:\/\//, "")}</a>).</p>
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
  startsAt: Date;
  endsAt: Date | null;
  updatedAt: Date;
  organizerName: string;
  communityName: string;
  communitySlug: string;
};

export async function notifyNewEvent(tx: Tx, e: EventInfo, recipients: Recipient[]) {
  const url = eventUrl(e.communitySlug, e.id);
  const ics = Buffer.from(buildIcs({ ...e, url }));
  const when = formatEventRange(e.startsAt, e.endsAt);
  await enqueueMails(
    each(recipients, {
      subject: `Neues Event in ${e.communityName}: ${e.title}`,
      text: `${e.organizerName} hat in „${e.communityName}“ ein neues Event erstellt.\n\n${e.title}\nWann: ${when}\nWo: ${e.location}\n\n${teaser(e.description, 400)}\n\nDetails ansehen und teilnehmen:\n${url}\n\nDen Termin für deinen Kalender findest du im Anhang (event.ics).\n`,
      html: layout(
        e.title,
        `<p>${escapeHtml(e.organizerName)} hat in <strong>${escapeHtml(e.communityName)}</strong> ein neues Event erstellt.</p>
         <table style="border-collapse:collapse">
           <tr><td style="padding:4px 16px 4px 0;color:#64748b">Wann</td><td>${escapeHtml(when)}</td></tr>
           <tr><td style="padding:4px 16px 4px 0;color:#64748b">Wo</td><td>${escapeHtml(e.location)}</td></tr>
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
