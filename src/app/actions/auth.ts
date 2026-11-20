"use server";
import { redirect } from "next/navigation";
import { clientIp } from "@/lib/auth/client-ip";
import { createSession, destroySession } from "@/lib/auth/session";
import { safeRedirectTarget, siteUrl } from "@/lib/domains";
import { run, type ActionState } from "@/lib/forms";
import { authenticate, register as registerUser, verifyEmail } from "@/services/users";

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
