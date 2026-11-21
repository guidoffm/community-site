// Mail-Outbox: Requests legen fertige Mails in mail_outbox ab, der Worker (APP_ROLE worker|all) verschickt sie.
// Mehrere Worker-Replikas sind möglich (FOR UPDATE SKIP LOCKED). Fehlversuche mit Backoff, max. 6 Versuche.
import { sql } from "drizzle-orm";
import { db, t, type Db } from "@/db";
import { sendMail } from "@/lib/mail";
import { APP_NAME, IMPRINT_URL, OPERATOR_NAME, PRIVACY_URL } from "@/lib/domains";

/** Pflichtangaben (Betreiber, Impressum, Datenschutz) unter jeder Text-Mail */
const TEXT_FOOTER = `\n--\n${APP_NAME} ist ein Angebot der ${OPERATOR_NAME}\nImpressum: ${IMPRINT_URL}\nDatenschutz: ${PRIVACY_URL}\n`;

export interface OutgoingMail {
  to: { email: string; name?: string };
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; contentType: string; content: Buffer }[];
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function enqueueMails(mails: OutgoingMail[], tx: Db | Tx = db()) {
  for (let i = 0; i < mails.length; i += 500) {
    await tx.insert(t.mailOutbox).values(
      mails.slice(i, i + 500).map((m) => ({
        toEmail: m.to.email,
        toName: m.to.name ?? null,
        subject: m.subject,
        text: m.text + TEXT_FOOTER,
        html: m.html ?? null,
        attachments: m.attachments?.map((a) => ({ filename: a.filename, contentType: a.contentType, contentBase64: a.content.toString("base64") })) ?? null,
      })),
    );
  }
  wakeOutbox();
}

const MAX_ATTEMPTS = 6;
const BATCH = 20;

/** Verschickt bis zu BATCH fällige Mails. Gibt die Anzahl bearbeiteter Mails zurück. */
export async function processOutbox(): Promise<number> {
  return db().transaction(async (tx) => {
    const rows = await tx.execute<{
      id: string;
      to_email: string;
      to_name: string | null;
      subject: string;
      text: string;
      html: string | null;
      attachments: { filename: string; contentType: string; contentBase64: string }[] | null;
      attempts: number;
    }>(sql`select id, to_email, to_name, subject, text, html, attachments, attempts from mail_outbox
           where status = 'pending' and run_after <= now()
           order by created_at limit ${BATCH} for update skip locked`);
    for (const r of rows.rows) {
      try {
        await sendMail({
          to: { email: r.to_email, name: r.to_name ?? undefined },
          subject: r.subject,
          text: r.text,
          html: r.html ?? undefined,
          attachments: r.attachments?.map((a) => ({ filename: a.filename, contentType: a.contentType, content: Buffer.from(a.contentBase64, "base64") })),
        });
        await tx.execute(sql`update mail_outbox set status = 'sent', sent_at = now(), attempts = attempts + 1, attachments = null where id = ${r.id}`);
      } catch (e) {
        const attempts = r.attempts + 1;
        const msg = (e instanceof Error ? e.message : String(e)).slice(0, 1000);
        const delayMin = Math.min(2 ** attempts, 240);
        await tx.execute(sql`update mail_outbox set attempts = ${attempts}, last_error = ${msg},
          status = ${attempts >= MAX_ATTEMPTS ? "failed" : "pending"},
          run_after = now() + make_interval(mins => ${delayMin}) where id = ${r.id}`);
        console.error(`[outbox] Versand an ${r.to_email} fehlgeschlagen (Versuch ${attempts})`, msg);
      }
    }
    return rows.rows.length;
  });
}

const g = globalThis as unknown as { __outboxTimer?: NodeJS.Timeout; __outboxWake?: () => void };

/** Im Prozess mit Worker-Rolle: sofort weiterarbeiten statt auf das nächste Intervall zu warten. */
function wakeOutbox() {
  g.__outboxWake?.();
}

export function startOutboxWorker(intervalMs = 5000) {
  if (g.__outboxTimer) return;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      while ((await processOutbox()) === BATCH) {
        /* weiter, solange volle Batches kommen */
      }
    } catch (e) {
      console.error("[outbox] Fehler", e);
    } finally {
      running = false;
    }
  };
  g.__outboxWake = () => void tick();
  g.__outboxTimer = setInterval(tick, intervalMs);
  console.log("[outbox] Worker gestartet");
}
