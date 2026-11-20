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
  await communities.joinCommunity(actor, String(fd.get("communityId")));
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
