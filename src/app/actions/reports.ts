"use server";
import { revalidatePath } from "next/cache";
import { clientIp } from "@/lib/auth/client-ip";
import { getActor, requireActor } from "@/lib/auth/session";
import { run, type ActionState } from "@/lib/forms";
import { createReport, decideReport } from "@/services/reports";

export async function submitReport(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const r = await createReport(
      await getActor(),
      {
        targetType: fd.get("targetType"),
        targetId: fd.get("targetId"),
        reason: fd.get("reason"),
        details: fd.get("details"),
        goodFaith: fd.get("goodFaith") === "on",
        reporterName: fd.get("reporterName"),
        reporterEmail: fd.get("reporterEmail"),
      },
      await clientIp(),
    );
    return { ok: `Danke! Deine Meldung ist eingegangen (Aktenzeichen ${r.id.slice(0, 8)}). Du bekommst eine Bestätigung per E-Mail und später unsere Entscheidung.`, data: { done: true } };
  });
}

export async function decide(reportId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireActor();
    const r = await decideReport(actor, reportId, { action: fd.get("action"), note: fd.get("note") });
    revalidatePath("/admin/reports");
    return `Entschieden (${r.count} Meldung${r.count === 1 ? "" : "en"}). Die Beteiligten werden per E-Mail informiert.`;
  });
}
