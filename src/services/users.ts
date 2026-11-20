import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, t } from "@/db";
import { AppError } from "@/lib/errors";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { blockedFor, clearFailures, recordFailure } from "@/lib/auth/rate-limit";

const registerInput = z.object({
  name: z.string().trim().min(2, "Bitte gib deinen Namen an.").max(80),
  email: z.email("Bitte gib eine gültige E-Mail-Adresse an.").transform((e) => e.trim().toLowerCase()),
  password: z.string().min(8, "Das Passwort muss mindestens 8 Zeichen lang sein.").max(200),
  communityIds: z.array(z.uuid()).default([]),
});

export async function register(input: unknown, ip: string) {
  const ipKey = `register:ip:${ip}`;
  const wait = await blockedFor([[ipKey, 10]]);
  if (wait) throw new AppError("FORBIDDEN", `Zu viele Registrierungen. Bitte in ${wait} Minuten erneut versuchen.`);

  const data = registerInput.parse(input);
  await recordFailure(ipKey); // zählt jede Registrierung pro IP
  return db().transaction(async (tx) => {
    const exists = await tx.query.users.findFirst({ where: eq(t.users.email, data.email) });
    if (exists) throw new AppError("CONFLICT", "Für diese E-Mail-Adresse existiert bereits ein Konto.");
    const [user] = await tx
      .insert(t.users)
      .values({ name: data.name, email: data.email, passwordHash: await hashPassword(data.password) })
      .returning();
    if (data.communityIds.length) {
      const cs = await tx.select({ id: t.communities.id }).from(t.communities).where(inArray(t.communities.id, data.communityIds));
      if (cs.length) await tx.insert(t.memberships).values(cs.map((c) => ({ communityId: c.id, userId: user.id })));
    }
    return user;
  });
}

export async function authenticate(emailRaw: string, password: string, ip: string) {
  const email = emailRaw.trim().toLowerCase();
  const keys = [`login:ip:${ip}`, `login:email:${email}`];
  const wait = await blockedFor([[keys[0], 20], [keys[1], 5]]);
  if (wait) throw new AppError("FORBIDDEN", `Zu viele Fehlversuche. Bitte in ${wait} Minuten erneut versuchen.`);

  const user = await db().query.users.findFirst({ where: eq(t.users.email, email) });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    await recordFailure(...keys);
    throw new AppError("UNAUTHORIZED", "E-Mail oder Passwort ist falsch.");
  }
  await clearFailures(keys[1]);
  return user;
}
