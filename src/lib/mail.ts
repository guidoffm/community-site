// E-Mail-Versand (wie simple-erp). Anbieter per MAIL_PROVIDER:
//   "smtp"  – SMTP-Relay (z. B. Brevo smtp-relay.brevo.com:587; SMTP_HOST/PORT/USER/PASSWORD)
//   "brevo" – Brevo-HTTP-API (BREVO_API_KEY)
//   "log"   – Entwicklung: nur protokollieren
// Versand erfolgt nicht direkt aus Requests, sondern über die Outbox (src/services/outbox.ts).
import nodemailer from "nodemailer";
import { AppError } from "./errors";

export interface MailAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}
export interface Mail {
  to: { email: string; name?: string };
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
}

export function mailConfigured() {
  const p = process.env.MAIL_PROVIDER;
  if (p === "log") return true;
  if (!process.env.MAIL_FROM_ADDRESS) return false;
  if (p === "brevo") return !!process.env.BREVO_API_KEY;
  if (p === "smtp") return !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASSWORD;
  return false;
}

const fromName = () => process.env.MAIL_FROM_NAME ?? "15k";

export async function sendMail(m: Mail): Promise<{ messageId: string }> {
  const provider = process.env.MAIL_PROVIDER;
  if (!mailConfigured())
    throw new AppError("UNAVAILABLE", "E-Mail-Versand ist nicht konfiguriert (MAIL_PROVIDER, MAIL_FROM_ADDRESS und SMTP_* bzw. BREVO_API_KEY)");

  if (provider === "log") {
    console.log(`[mail:log] an ${m.to.email}: ${m.subject} (${m.attachments?.length ?? 0} Anhänge)`);
    return { messageId: `log-${Date.now()}` };
  }
  if (provider === "smtp") return sendSmtp(m);

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY!, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: process.env.MAIL_FROM_ADDRESS, name: fromName() },
      to: [m.to],
      subject: m.subject,
      textContent: m.text,
      ...(m.html ? { htmlContent: m.html } : {}),
      ...(m.attachments?.length ? { attachment: m.attachments.map((a) => ({ name: a.filename, content: a.content.toString("base64") })) } : {}),
    }),
  });
  if (!res.ok) throw new AppError("UNAVAILABLE", `E-Mail-Versand fehlgeschlagen (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { messageId?: string };
  return { messageId: body.messageId ?? "" };
}

let transport: nodemailer.Transporter | null = null;
function smtp() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      requireTLS: port === 587,
      auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASSWORD! },
    });
  }
  return transport;
}

async function sendSmtp(m: Mail): Promise<{ messageId: string }> {
  try {
    const info = await smtp().sendMail({
      from: { name: fromName(), address: process.env.MAIL_FROM_ADDRESS! },
      to: m.to.name ? { name: m.to.name, address: m.to.email } : m.to.email,
      subject: m.subject,
      text: m.text,
      html: m.html,
      attachments: m.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
    });
    return { messageId: info.messageId ?? "" };
  } catch (e) {
    throw new AppError("UNAVAILABLE", `E-Mail-Versand fehlgeschlagen: ${(e as Error).message.slice(0, 300)}`);
  }
}
