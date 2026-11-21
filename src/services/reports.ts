// Meldeverfahren nach Art. 16/17 DSA: Meldung → Eingangsbestätigung → Prüfung durch Site-Admin →
// Entscheidung an Meldende, Begründung an Betroffene.
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, t } from "@/db";
import type { Actor } from "@/lib/auth/session";
import { AppError, forbidden, notFound } from "@/lib/errors";
import { blockedFor, recordFailure } from "@/lib/auth/rate-limit";
import { communityUrl, siteUrl } from "@/lib/domains";
import { teaser, UUID_RE } from "@/lib/utils";
import { enqueueMails } from "./outbox";
import { removeImage } from "./images";
import { removeEvent } from "./events";
import { removeHomepage } from "./homepages";
import { reportMails } from "./notifications";

export const TARGET_TYPES = ["message", "image", "homepage", "event", "community"] as const;
export type TargetType = (typeof TARGET_TYPES)[number];
export const TARGET_LABELS: Record<TargetType, string> = {
  message: "Nachricht",
  image: "Foto",
  homepage: "Homepage",
  event: "Event",
  community: "Community",
};
export const REASONS = {
  illegal: "Rechtswidriger Inhalt (z. B. Beleidigung, Bedrohung, Volksverhetzung)",
  rights: "Verletzung von Rechten (z. B. Recht am eigenen Bild, Urheberrecht)",
  harassment: "Belästigung, Hass oder Diskriminierung",
  minors: "Gefährdung von Kindern oder Jugendlichen",
  spam: "Spam oder Betrug",
  other: "Sonstiger Verstoß gegen die Nutzungsbedingungen",
} as const;

type TargetInfo = { label: string; ownerId: string | null; url: string | null; preview: string; imageId?: string };

/** Was wird gemeldet? Liefert Beschreibung, Eigentümer und Link – oder null, wenn es den Inhalt nicht (mehr) gibt. */
export async function describeTarget(type: TargetType, id: string): Promise<TargetInfo | null> {
  if (!UUID_RE.test(id)) return null;
  switch (type) {
    case "message": {
      const m = await db().query.messages.findFirst({ where: eq(t.messages.id, id) });
      return m ? { label: `Nachricht „${m.subject}“`, ownerId: m.senderId, url: null, preview: `${m.subject}\n\n${m.body}` } : null;
    }
    case "image": {
      const i = await db().query.images.findFirst({ where: eq(t.images.id, id) });
      return i ? { label: `Foto${i.caption ? ` „${i.caption}“` : ""}`, ownerId: i.uploaderId, url: siteUrl(`/api/images/${i.id}`), preview: i.caption ?? "", imageId: i.id } : null;
    }
    case "homepage": {
      const h = await db().query.homepages.findFirst({ where: eq(t.homepages.userId, id) });
      return h ? { label: `Homepage „${h.title}“`, ownerId: h.userId, url: siteUrl(`/u/${h.userId}`), preview: `${h.title}\n\n${h.content}` } : null;
    }
    case "event": {
      const e = await db().query.events.findFirst({ where: eq(t.events.id, id) });
      if (!e) return null;
      const c = await db().query.communities.findFirst({ where: eq(t.communities.id, e.communityId) });
      return { label: `Event „${e.title}“`, ownerId: e.organizerId, url: c ? communityUrl(c.slug, `/events/${e.id}`) : null, preview: `${e.title}\n${e.location}\n\n${e.description}` };
    }
    case "community": {
      const c = await db().query.communities.findFirst({ where: eq(t.communities.id, id) });
      return c ? { label: `Community „${c.title}“`, ownerId: c.createdBy, url: communityUrl(c.slug), preview: `${c.title}\n\n${c.description}` } : null;
    }
  }
}

const reportInput = z.object({
  targetType: z.enum(TARGET_TYPES),
  targetId: z.string(),
  reason: z.enum(Object.keys(REASONS) as [keyof typeof REASONS, ...(keyof typeof REASONS)[]]),
  details: z.string().trim().min(10, "Bitte begründe die Meldung (mindestens 10 Zeichen).").max(5000),
  goodFaith: z.literal(true, { error: "Bitte bestätige, dass deine Angaben nach bestem Wissen richtig sind." }),
  reporterName: z.string().trim().max(100).optional().nullable(),
  reporterEmail: z.string().trim().max(200).optional().nullable(),
});

export async function createReport(actor: Actor | null, input: unknown, ip: string) {
  const wait = await blockedFor([[`report:ip:${ip}`, 10]]);
  if (wait) throw new AppError("FORBIDDEN", `Zu viele Meldungen. Bitte in ${wait} Minuten erneut versuchen.`);
  const data = reportInput.parse(input);
  const name = actor?.name ?? data.reporterName ?? "";
  const email = (actor?.email ?? data.reporterEmail ?? "").toLowerCase();
  // Art. 16 Abs. 2 lit. c DSA: Name und E-Mail der meldenden Person
  if (!actor && (name.length < 2 || !z.email().safeParse(email).success))
    throw new AppError("VALIDATION", "Bitte gib deinen Namen und eine gültige E-Mail-Adresse an.");
  const target = await describeTarget(data.targetType, data.targetId);
  if (!target) throw notFound("Gemeldeter Inhalt");
  await recordFailure(`report:ip:${ip}`);

  return db().transaction(async (tx) => {
    const [r] = await tx
      .insert(t.reports)
      .values({
        targetType: data.targetType,
        targetId: data.targetId,
        targetLabel: target.label.slice(0, 200),
        reason: data.reason,
        details: data.details,
        reporterId: actor?.userId ?? null,
        reporterName: name,
        reporterEmail: email,
      })
      .returning();
    const admins = await tx.select({ email: t.users.email, name: t.users.name }).from(t.users).where(eq(t.users.isSiteAdmin, true));
    await enqueueMails(reportMails.received({ email, name }, r.id, target.label, REASONS[data.reason]), tx);
    if (admins.length) await enqueueMails(reportMails.adminNotice(admins, r.id, target.label, REASONS[data.reason], teaser(data.details, 300)), tx);
    return r;
  });
}

function requireAdmin(actor: Actor) {
  if (!actor.isSiteAdmin) throw forbidden("Nur für Site-Admins.");
}

export async function listReports(actor: Actor, status: "open" | "closed") {
  requireAdmin(actor);
  const rows = await db()
    .select()
    .from(t.reports)
    .where(status === "open" ? eq(t.reports.status, "open") : sql`${t.reports.status} <> 'open'`)
    .orderBy(status === "open" ? t.reports.createdAt : desc(t.reports.decidedAt))
    .limit(100);
  return Promise.all(rows.map(async (r) => ({ ...r, target: await describeTarget(r.targetType as TargetType, r.targetId) })));
}

export async function openReportCount() {
  const [r] = await db().select({ n: sql<number>`count(*)::int` }).from(t.reports).where(eq(t.reports.status, "open"));
  return r.n;
}

const decisionInput = z.object({
  action: z.enum(["remove", "block", "dismiss"]),
  note: z.string().trim().min(5, "Bitte begründe die Entscheidung (wird den Beteiligten mitgeteilt).").max(3000),
});

/** Entscheidung über eine Meldung. Gilt für alle offenen Meldungen zum selben Inhalt. */
export async function decideReport(actor: Actor, reportId: string, input: unknown) {
  requireAdmin(actor);
  const { action, note } = decisionInput.parse(input);
  const report = await db().query.reports.findFirst({ where: eq(t.reports.id, reportId) });
  if (!report) throw notFound("Meldung");
  if (report.status !== "open") throw new AppError("CONFLICT", "Die Meldung ist bereits entschieden.");
  const type = report.targetType as TargetType;
  const target = await describeTarget(type, report.targetId);
  const owner = target?.ownerId ? await db().query.users.findFirst({ where: eq(t.users.id, target.ownerId) }) : null;

  if (action !== "dismiss" && !target) throw new AppError("CONFLICT", "Der Inhalt existiert nicht mehr – bitte abweisen.");
  if (action === "remove") {
    if (type === "community") throw new AppError("VALIDATION", "Communities bitte über „Bearbeiten“ anpassen oder sperren statt entfernen.");
    if (type === "message") await db().delete(t.messages).where(eq(t.messages.id, report.targetId));
    if (type === "image") await removeImage(report.targetId);
    if (type === "homepage") await removeHomepage(report.targetId);
    if (type === "event") await removeEvent(report.targetId, "15k-Moderation");
  }
  if (action === "block") {
    if (!owner) throw new AppError("CONFLICT", "Zu diesem Inhalt gibt es kein Konto, das gesperrt werden könnte.");
    if (owner.isSiteAdmin) throw new AppError("FORBIDDEN", "Site-Admins können nicht gesperrt werden.");
    await db().update(t.users).set({ blockedAt: new Date(), blockedReason: note }).where(eq(t.users.id, owner.id));
  }

  const status = action === "remove" ? "removed" : action === "block" ? "blocked" : "dismissed";
  const decided = await db()
    .update(t.reports)
    .set({ status, decisionNote: note, decidedBy: actor.userId, decidedAt: new Date() })
    .where(and(eq(t.reports.targetType, report.targetType), eq(t.reports.targetId, report.targetId), eq(t.reports.status, "open")))
    .returning();

  // Entscheidung an alle Meldenden (Art. 16 Abs. 5), Begründung an Betroffene (Art. 17)
  const mails = decided
    .filter((r) => r.reporterEmail)
    .flatMap((r) => reportMails.decision({ email: r.reporterEmail!, name: r.reporterName ?? "" }, r.targetLabel, status, note));
  if (owner && action !== "dismiss") mails.push(...reportMails.statementOfReasons({ email: owner.email, name: owner.name }, report.targetLabel, action, note));
  if (mails.length) await enqueueMails(mails);
  return { status, count: decided.length };
}
