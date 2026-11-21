"use server";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { revalidatePath } from "next/cache";
import { createSession, requireActor, setChallengeCookie, takeChallengeCookie } from "@/lib/auth/session";
import { safeRedirectTarget } from "@/lib/domains";
import { errorMessage } from "@/lib/errors";
import * as passkeys from "@/services/passkeys";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: errorMessage(e) });

export async function passkeyLoginOptions(): Promise<Result<Awaited<ReturnType<typeof passkeys.startLogin>>["options"]>> {
  try {
    const { options, challengeId } = await passkeys.startLogin();
    await setChallengeCookie(challengeId);
    return { ok: true, data: options };
  } catch (e) {
    return fail(e);
  }
}

export async function passkeyLoginFinish(response: AuthenticationResponseJSON, next: string): Promise<Result<string>> {
  try {
    const user = await passkeys.finishLogin(await takeChallengeCookie(), response);
    await createSession(user.id);
    return { ok: true, data: safeRedirectTarget(next) };
  } catch (e) {
    return fail(e);
  }
}

export async function passkeyRegisterOptions(): Promise<Result<Awaited<ReturnType<typeof passkeys.startRegistration>>["options"]>> {
  try {
    const actor = await requireActor();
    const { options, challengeId } = await passkeys.startRegistration(actor);
    await setChallengeCookie(challengeId);
    return { ok: true, data: options };
  } catch (e) {
    return fail(e);
  }
}

export async function passkeyRegisterFinish(response: RegistrationResponseJSON, name: string): Promise<Result> {
  try {
    const actor = await requireActor();
    await passkeys.finishRegistration(actor, await takeChallengeCookie(), response, name);
    revalidatePath("/account");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deletePasskey(fd: FormData) {
  const actor = await requireActor();
  await passkeys.deletePasskey(actor, String(fd.get("id")));
  revalidatePath("/account");
}
