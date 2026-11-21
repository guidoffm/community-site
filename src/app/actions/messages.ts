"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth/session";
import { siteUrl } from "@/lib/domains";
import { run, type ActionState } from "@/lib/forms";
import * as messages from "@/services/messages";

export async function sendMessage(slug: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireActor();
    const msg = await messages.sendMessage(actor, slug, {
      subject: fd.get("subject"),
      body: fd.get("body"),
      mode: fd.get("mode"),
      recipientIds: fd.getAll("recipientIds").map(String),
    });
    redirect(siteUrl(`/messages/${msg.id}?sent=1`));
  });
}

export async function replyToMessage(messageId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireActor();
    const msg = await messages.replyToMessage(actor, messageId, { body: fd.get("body"), replyAll: fd.get("replyAll") === "on" });
    redirect(siteUrl(`/messages/${msg.id}?sent=1`));
  });
}

export async function deleteMessages(fd: FormData) {
  const actor = await requireActor();
  await messages.deleteMessages(actor, fd.getAll("ids").map(String));
  revalidatePath("/messages");
  revalidatePath("/", "layout");
  const back = fd.get("back");
  if (typeof back === "string" && back.startsWith("/messages")) redirect(siteUrl(back));
}
