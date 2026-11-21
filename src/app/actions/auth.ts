"use server";
import { redirect } from "next/navigation";
import { clientIp } from "@/lib/auth/client-ip";
import { createSession, destroySession } from "@/lib/auth/session";
import { safeRedirectTarget, siteUrl } from "@/lib/domains";
import { run, type ActionState } from "@/lib/forms";
import { authenticate, changePassword as changePasswordService, register as registerUser, requestLoginCode, requestPasswordReset, resetPassword, verifyEmail, verifyLoginCode } from "@/services/users";
import { deleteAccount as deleteAccountService } from "@/services/account";
import { requireActor } from "@/lib/auth/session";

export async function login(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await authenticate(String(fd.get("email") ?? ""), String(fd.get("password") ?? ""), await clientIp());
    await createSession(user.id);
    redirect(safeRedirectTarget(fd.get("next")));
  });
}

export async function register(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    // Honeypot gegen Bots
    if (fd.get("website")) redirect(siteUrl("/"));
    const { user } = await registerUser(
      {
        name: fd.get("name"),
        email: fd.get("email"),
        password: fd.get("password"),
        communityIds: fd.getAll("communityIds").map(String),
        next: fd.get("next") ? safeRedirectTarget(fd.get("next")) : null,
      },
      await clientIp(),
    );
    // Kein Login: erst nach Bestätigung per E-Mail
    redirect(siteUrl(`/register/check-email?email=${encodeURIComponent(user.email)}`));
  });
}

export async function confirmEmail(token: string, _: ActionState): Promise<ActionState> {
  return run(async () => {
    const { user, next } = await verifyEmail(token);
    await createSession(user.id);
    redirect(safeRedirectTarget(next || "/?welcome=1"));
  });
}

export async function logout() {
  await destroySession();
  redirect(siteUrl("/"));
}

export async function deleteAccount(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireActor();
    if (fd.get("confirm") !== "LÖSCHEN") return { error: "Bitte gib zur Bestätigung LÖSCHEN ein." };
    await deleteAccountService(actor, String(fd.get("password") ?? ""), await clientIp());
    await destroySession();
    redirect(siteUrl("/?deleted=1"));
  });
}

export async function forgotPassword(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await requestPasswordReset(String(fd.get("email") ?? ""), await clientIp());
    // immer dieselbe Antwort – verrät nicht, ob es ein Konto gibt
    return "Falls ein Konto mit dieser Adresse existiert, haben wir dir einen Link zum Zurücksetzen geschickt. Er ist eine Stunde gültig.";
  });
}

export async function setNewPassword(token: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    if (fd.get("password") !== fd.get("password2")) return { error: "Die Passwörter stimmen nicht überein." };
    const user = await resetPassword(token, fd.get("password"));
    await createSession(user.id);
    redirect(siteUrl("/?passwordReset=1"));
  });
}

export async function changePassword(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireActor();
    if (fd.get("password") !== fd.get("password2")) return { error: "Die neuen Passwörter stimmen nicht überein." };
    await changePasswordService(actor.userId, String(fd.get("current") ?? ""), fd.get("password"));
    await createSession(actor.userId); // diese Sitzung bleibt gültig, alle anderen nicht
    return "Passwort geändert. Auf anderen Geräten musst du dich neu anmelden.";
  });
}

export async function sendLoginCode(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const email = String(fd.get("email") ?? "").trim();
    await requestLoginCode(email, await clientIp());
    // gleiche Antwort, ob es das Konto gibt oder nicht
    return { ok: "Falls ein Konto mit dieser Adresse existiert, haben wir dir einen 6-stelligen Code geschickt (10 Minuten gültig).", data: { email } };
  });
}

export async function loginWithCode(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await verifyLoginCode(String(fd.get("email") ?? ""), String(fd.get("code") ?? ""), await clientIp());
    await createSession(user.id);
    redirect(safeRedirectTarget(fd.get("next")));
  });
}
