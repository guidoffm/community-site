// Einstieg für Kubernetes-CronJobs: POST /api/jobs/run?job=<name>, Authorization: Bearer <JOB_TOKEN>
import { timingSafeEqual } from "node:crypto";
import { runJob } from "@/services/jobs";

export const dynamic = "force-dynamic";

function authorized(req: Request) {
  const expected = process.env.JOB_TOKEN;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || expected.length < 32) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Nicht berechtigt" }, { status: 401 });
  const job = new URL(req.url).searchParams.get("job") ?? "";
  try {
    const r = await runJob(job, "cron");
    return Response.json(r, { status: r.status === "failed" ? 500 : 200 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 404 });
  }
}
