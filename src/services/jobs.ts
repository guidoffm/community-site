// Jobsteuerung (wie simple-erp): ausgelöst per Kubernetes-CronJob (POST /api/jobs/run?job=<name>, Bearer JOB_TOKEN).
// Jeder Lauf wird in job_runs protokolliert; ein Job läuft nie parallel zu sich selbst (Advisory-Lock).
// Neuer Job: hier registrieren und im Cluster einen CronJob ergänzen.
import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { db, t, withAdvisoryLock } from "@/db";
import { AppError } from "@/lib/errors";
import { purgeRateLimits } from "@/lib/auth/rate-limit";
import { processStorageDeletions } from "./storage-cleanup";
import { deleteUnverifiedUsers } from "./users";
import { sendEventReminders } from "./reminders";

interface JobDef {
  title: string;
  schedule: string;
  run: () => Promise<Record<string, unknown>>;
}

export const jobs: Record<string, JobDef> = {
  cleanup: {
    title: "Aufräumen: Outbox, Rate-Limits, Job-Protokoll",
    schedule: "täglich 04:30",
    run: async () => {
      const day = 86_400_000;
      const sent = await db()
        .delete(t.mailOutbox)
        .where(and(inArray(t.mailOutbox.status, ["sent", "failed"]), lt(t.mailOutbox.createdAt, new Date(Date.now() - 30 * day))))
        .returning({ id: t.mailOutbox.id });
      const runs = await db().delete(t.jobRuns).where(lt(t.jobRuns.startedAt, new Date(Date.now() - 90 * day))).returning({ id: t.jobRuns.id });
      // entschiedene Meldungen (DSA) nach einem Jahr löschen
      const reports = await db().delete(t.reports).where(and(sql`${t.reports.status} <> 'open'`, lt(t.reports.decidedAt, new Date(Date.now() - 365 * day)))).returning({ id: t.reports.id });
      return { outboxDeleted: sent.length, jobRunsDeleted: runs.length, reportsDeleted: reports.length, rateLimitHits: await purgeRateLimits() };
    },
  },
  "event-reminders": {
    title: "Erinnerungen an Event-Teilnehmer (3 Tage, 1 Tag, 4 Stunden vorher)",
    schedule: "alle 10 Minuten",
    run: async () => sendEventReminders(),
  },
  "unverified-cleanup": {
    title: "Unbestätigte Registrierungen löschen (älter als 24 h)",
    schedule: "stündlich (Minute 10)",
    run: async () => deleteUnverifiedUsers(),
  },
  "storage-cleanup": {
    title: "Vorgemerkte Bild-Objekte im S3-Speicher löschen",
    schedule: "stündlich (Minute 20)",
    run: async () => processStorageDeletions(),
  },
};

const STALE_MS = 60 * 60_000;

export async function runJob(name: string, trigger: "cron" | "manual") {
  const def = jobs[name];
  if (!def) throw new AppError("NOT_FOUND", `Job "${name}" unbekannt`);
  const r = await withAdvisoryLock(`community:job:${name}`, () => runJobLocked(name, trigger, def));
  if (!r.skipped) return r.value;
  const [skip] = await db().insert(t.jobRuns).values({ job: name, trigger, status: "skipped", result: { reason: "läuft bereits (anderer Pod)" }, finishedAt: new Date() }).returning();
  return skip;
}

async function runJobLocked(name: string, trigger: "cron" | "manual", def: JobDef) {
  const running = await db()
    .select({ id: t.jobRuns.id })
    .from(t.jobRuns)
    .where(and(eq(t.jobRuns.job, name), eq(t.jobRuns.status, "running"), gt(t.jobRuns.startedAt, new Date(Date.now() - STALE_MS))));
  if (running.length) {
    const [skip] = await db().insert(t.jobRuns).values({ job: name, trigger, status: "skipped", result: { reason: "läuft bereits" }, finishedAt: new Date() }).returning();
    return skip;
  }
  const [run] = await db().insert(t.jobRuns).values({ job: name, trigger, status: "running" }).returning();
  try {
    const result = await def.run();
    const errors = Array.isArray(result.errors) ? result.errors.length : 0;
    const [done] = await db()
      .update(t.jobRuns)
      .set({ status: errors ? "failed" : "success", result, error: errors ? `${errors} Fehler` : null, finishedAt: new Date() })
      .where(eq(t.jobRuns.id, run.id))
      .returning();
    return done;
  } catch (e) {
    const [failed] = await db()
      .update(t.jobRuns)
      .set({ status: "failed", error: e instanceof Error ? e.message : String(e), finishedAt: sql`now()` })
      .where(eq(t.jobRuns.id, run.id))
      .returning();
    return failed;
  }
}
