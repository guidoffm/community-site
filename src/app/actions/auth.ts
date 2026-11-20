"use server";
import { redirect } from "next/navigation";
import { clientIp } from "@/lib/auth/client-ip";
import { createSession, destroySession } from "@/lib/auth/session";
import { safeRedirectTarget, siteUrl } from "@/lib/domains";
import { run, type ActionState } from "@/lib/forms";
import { authenticate, register as registerUser } from "@/services/users";

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
    const user = await registerUser(
      {
        name: fd.get("name"),
        email: fd.get("email"),
        password: fd.get("password"),
        communityIds: fd.getAll("communityIds").map(String),
      },
      await clientIp(),
    );
    await createSession(user.id);
    redirect(safeRedirectTarget(fd.get("next") || "/"));
  });
}

export async function logout() {
  await destroySession();
  redirect(siteUrl("/"));
}
