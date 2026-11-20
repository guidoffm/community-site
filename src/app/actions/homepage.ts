"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { siteUrl } from "@/lib/domains";
import { formObject, run, type ActionState } from "@/lib/forms";
import { UUID_RE } from "@/lib/utils";
import * as homepages from "@/services/homepages";
import * as images from "@/services/images";

export async function saveHomepage(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireActor();
    await homepages.saveHomepage(actor, formObject(fd));
    revalidatePath("/homepage");
    revalidatePath(`/u/${actor.userId}`);
    return "Homepage gespeichert.";
  });
}

export async function deleteHomepage() {
  const actor = await requireActor();
  await homepages.deleteHomepage(actor);
  redirect(siteUrl("/homepage"));
}

export async function deleteImage(fd: FormData) {
  const actor = await requireActor();
  const id = String(fd.get("imageId"));
  if (!UUID_RE.test(id)) return;
  await images.deleteImage(actor, id);
  revalidatePath("/", "layout");
}
