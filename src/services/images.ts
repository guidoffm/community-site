import { randomUUID } from "node:crypto";
import { and, asc, count, eq } from "drizzle-orm";
import { db, t } from "@/db";
import type { Actor } from "@/lib/auth/session";
import { AppError, forbidden, notFound } from "@/lib/errors";
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_HOMEPAGE,
  MAX_PHOTOS_PER_USER_AND_EVENT,
  detectImageType,
  processImage,
  readImageFile,
  saveImageFiles,
  type ImageVariant,
} from "@/lib/images";
import { canViewHomepage } from "./homepages";
import { eventHasStarted, isParticipant } from "./events";
import { deleteScheduled, scheduleImageDeletion } from "./storage-cleanup";

export type UploadTarget = { kind: "homepage" } | { kind: "event"; eventId: string };

/** Bilder hochladen. Jedes Bild erhält eine UUID (DB-ID und Teil des Objekt-Keys). */
export async function uploadImages(actor: Actor, target: UploadTarget, files: File[], caption: string | null) {
  if (files.length === 0) throw new AppError("VALIDATION", "Keine Datei ausgewählt.");

  let owner: { homepageUserId: string } | { eventId: string };
  let remaining: number;
  if (target.kind === "event") {
    const event = await db().query.events.findFirst({ where: eq(t.events.id, target.eventId) });
    if (!event || !(await isParticipant(event, actor.userId))) throw forbidden("Nur Teilnehmer des Events können Fotos hochladen.");
    if (!eventHasStarted(event)) throw new AppError("CONFLICT", "Fotos können erst hochgeladen werden, wenn das Event stattgefunden hat.");
    const [r] = await db().select({ n: count() }).from(t.images).where(and(eq(t.images.eventId, event.id), eq(t.images.uploaderId, actor.userId)));
    remaining = MAX_PHOTOS_PER_USER_AND_EVENT - r.n;
    owner = { eventId: event.id };
  } else {
    const hp = await db().query.homepages.findFirst({ where: eq(t.homepages.userId, actor.userId) });
    if (!hp) throw new AppError("CONFLICT", "Bitte speichere zuerst deine Homepage.");
    const [r] = await db().select({ n: count() }).from(t.images).where(eq(t.images.homepageUserId, actor.userId));
    remaining = MAX_IMAGES_PER_HOMEPAGE - r.n;
    owner = { homepageUserId: actor.userId };
  }
  if (files.length > remaining) throw new AppError("CONFLICT", `Du kannst hier noch ${Math.max(remaining, 0)} Bild(er) hochladen.`);

  const errors: string[] = [];
  let uploaded = 0;
  for (const file of files) {
    if (file.size > MAX_IMAGE_BYTES) {
      errors.push(`${file.name}: größer als 10 MB`);
      continue;
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const mimeType = detectImageType(buf);
    if (!mimeType) {
      errors.push(`${file.name}: kein unterstütztes Bildformat`);
      continue;
    }
    try {
      const img = await processImage(buf, mimeType);
      const id = randomUUID();
      await saveImageFiles(id, img);
      await db().insert(t.images).values({
        id,
        uploaderId: actor.userId,
        ...owner,
        mimeType: img.fullType,
        size: img.full.length,
        width: img.width,
        height: img.height,
        caption: caption?.trim().slice(0, 200) || null,
      });
      uploaded++;
    } catch (e) {
      console.error("[upload]", e);
      errors.push(`${file.name}: konnte nicht verarbeitet werden`);
    }
  }
  return { uploaded, errors };
}

export async function eventPhotos(eventId: string) {
  return db()
    .select({
      id: t.images.id,
      caption: t.images.caption,
      width: t.images.width,
      height: t.images.height,
      uploaderId: t.images.uploaderId,
      uploaderName: t.users.name,
    })
    .from(t.images)
    .innerJoin(t.users, eq(t.users.id, t.images.uploaderId))
    .where(eq(t.images.eventId, eventId))
    .orderBy(asc(t.images.createdAt));
}

/** Bild ausliefern – mit denselben Sichtbarkeitsregeln wie Homepage bzw. Event. */
export async function readImage(viewer: Actor | null, id: string, variant: ImageVariant) {
  const img = await db().query.images.findFirst({ where: eq(t.images.id, id) });
  if (!img) throw notFound("Bild");
  let isPublic = false;
  if (img.homepageUserId) {
    const hp = await db().query.homepages.findFirst({ where: eq(t.homepages.userId, img.homepageUserId) });
    if (!hp || !(await canViewHomepage(hp, viewer?.userId ?? null))) throw notFound("Bild");
    isPublic = hp.visibility === "public";
  } else {
    const event = await db().query.events.findFirst({ where: eq(t.events.id, img.eventId!) });
    if (!event || !(await isParticipant(event, viewer?.userId ?? null))) throw notFound("Bild");
  }
  const data = await readImageFile(img.id, variant);
  if (!data) throw notFound("Bild");
  return { data, contentType: variant === "thumb" ? "image/webp" : img.mimeType, isPublic };
}

/** Löschen: Uploader, Homepage-Inhaber oder (bei Event-Fotos) der Organisator. */
export async function deleteImage(actor: Actor, id: string) {
  const img = await db().query.images.findFirst({ where: eq(t.images.id, id) });
  if (!img) throw notFound("Bild");
  let allowed = img.uploaderId === actor.userId || img.homepageUserId === actor.userId;
  if (!allowed && img.eventId) {
    const ev = await db().query.events.findFirst({ where: eq(t.events.id, img.eventId), columns: { organizerId: true } });
    allowed = ev?.organizerId === actor.userId;
  }
  if (!allowed) throw forbidden();
  const keys = await db().transaction(async (tx) => {
    const keys = await scheduleImageDeletion(tx, [img.id]);
    await tx.delete(t.images).where(eq(t.images.id, img.id));
    return keys;
  });
  await deleteScheduled(keys);
  return img;
}
