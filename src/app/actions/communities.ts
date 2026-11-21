"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { communityUrl } from "@/lib/domains";
import { formObject, run, type ActionState } from "@/lib/forms";
import * as communities from "@/services/communities";

export async function createCommunity(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireActor();
    const c = await communities.createCommunity(actor, formObject(fd));
    redirect(communityUrl(c.slug));
  });
}

export async function joinCommunity(fd: FormData) {
  const actor = await requireActor();
  await communities.joinCommunity(actor, String(fd.get("communityId")), fd.get("message") ? String(fd.get("message")) : null);
  revalidatePath("/", "layout");
}

export async function leaveCommunity(fd: FormData) {
  const actor = await requireActor();
  await communities.leaveCommunity(actor, String(fd.get("communityId")));
  revalidatePath("/", "layout");
}

export async function updateCommunity(slug: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireActor();
    await communities.updateCommunity(actor, slug, formObject(fd));
    revalidatePath(`/c/${slug}`);
    redirect(communityUrl(slug, "/?saved=1"));
  });
}

const settings = (slug: string) => revalidatePath(`/c/${slug}/settings`);

export async function decideJoinRequest(slug: string, fd: FormData) {
  const actor = await requireActor();
  await communities.decideJoinRequest(actor, slug, String(fd.get("userId")), fd.get("decision") === "approve");
  settings(slug);
}

export async function setMemberRole(slug: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireActor();
    await communities.setMemberRole(actor, slug, String(fd.get("userId")), fd.get("role") === "admin" ? "admin" : "member");
    settings(slug);
    return "Rolle geändert.";
  });
}

export async function removeMember(slug: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireActor();
    await communities.removeMember(actor, slug, String(fd.get("userId")));
    settings(slug);
    return "Mitglied entfernt.";
  });
}

export async function inviteByEmail(slug: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireActor();
    const r = await communities.inviteByEmail(actor, slug, String(fd.get("emails") ?? ""));
    settings(slug);
    return `${r.sent} Einladung${r.sent === 1 ? "" : "en"} verschickt.${r.invalid.length ? ` Ungültig: ${r.invalid.join(", ")}` : ""}`;
  });
}

export async function createInviteLink(slug: string, _: ActionState): Promise<ActionState> {
  return run(async () => {
    const actor = await requireActor();
    const url = await communities.createInviteLink(actor, slug);
    settings(slug);
    return { ok: "Neuer Einladungslink erstellt (der bisherige ist ungültig). Er wird nur jetzt angezeigt – kopiere ihn:", data: { url } };
  });
}

export async function revokeInviteLinks(slug: string) {
  const actor = await requireActor();
  await communities.revokeInviteLinks(actor, slug);
  settings(slug);
}

export async function removeCommunityImage(slug: string, fd: FormData) {
  const actor = await requireActor();
  await communities.removeCommunityImage(actor, slug, fd.get("kind") === "cover" ? "cover" : "logo");
  settings(slug);
  revalidatePath(`/c/${slug}`);
}

export async function acceptInvite(token: string, _: ActionState): Promise<ActionState> {
  return run(async () => {
    const actor = await requireActor();
    const c = await communities.acceptInvite(actor, token);
    redirect(communityUrl(c.slug, "/?joined=1"));
  });
}
