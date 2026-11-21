"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { communityUrl } from "@/lib/domains";
import { formObject, run, type ActionState } from "@/lib/forms";
import * as events from "@/services/events";

export async function createEvent(slug: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireActor();
    const e = await events.createEvent(actor, slug, { ...formObject(fd), allowGuests: fd.get("allowGuests") === "on" });
    redirect(communityUrl(slug, `/events/${e.id}?created=1`));
  });
}

export async function setRegistration(fd: FormData) {
  const actor = await requireActor();
  const slug = String(fd.get("slug"));
  const eventId = String(fd.get("eventId"));
  await events.setRegistration(actor, slug, eventId, fd.get("intent") === "register", fd.get("guests") ?? 0);
  revalidatePath(`/c/${slug}/events/${eventId}`);
}

export async function cancelEvent(fd: FormData) {
  const actor = await requireActor();
  const slug = String(fd.get("slug"));
  await events.cancelEvent(actor, slug, String(fd.get("eventId")));
  redirect(communityUrl(slug));
}

export async function updateEvent(slug: string, eventId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireActor();
    const r = await events.updateEvent(actor, slug, eventId, { ...formObject(fd), allowGuests: fd.get("allowGuests") === "on" });
    redirect(communityUrl(slug, `/events/${eventId}?updated=${r.notified ? "notified" : "1"}`));
  });
}
