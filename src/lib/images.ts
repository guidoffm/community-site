import sharp from "sharp";
import { deleteObjects, getObject, putObject } from "./storage";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGES_PER_HOMEPAGE = 30;
export const MAX_PHOTOS_PER_USER_AND_EVENT = 50;
const FULL_MAX_EDGE = 2560;
const THUMB_EDGE = 480;

/** Bildtyp anhand der Magic Bytes – Dateiname/Content-Type des Browsers zählen nicht. */
export function detectImageType(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.subarray(0, 6).toString("ascii"))) return "image/gif";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP")
    return "image/webp";
  return null;
}

/**
 * Vollbild (laut EXIF gedreht, max. 2560 px, ohne Metadaten wie GPS) + quadratisches WebP-Thumbnail.
 * Animierte GIFs bleiben als Vollbild unverändert, das Thumbnail zeigt das erste Frame.
 */
export async function processImage(input: Buffer, mimeType: string) {
  const meta = await sharp(input, { limitInputPixels: 50_000_000 }).metadata();
  const animated = mimeType === "image/gif" && (meta.pages ?? 1) > 1;

  let full: Buffer;
  let fullType = mimeType;
  let width: number;
  let height: number;
  if (animated) {
    full = input;
    width = meta.width ?? 0;
    height = meta.pageHeight ?? meta.height ?? 0;
  } else {
    const p = sharp(input).rotate().resize(FULL_MAX_EDGE, FULL_MAX_EDGE, { fit: "inside", withoutEnlargement: true });
    const out =
      mimeType === "image/png"
        ? await p.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
        : mimeType === "image/webp"
          ? await p.webp({ quality: 85 }).toBuffer({ resolveWithObject: true })
          : await p.jpeg({ quality: 85, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    if (mimeType === "image/gif") fullType = "image/jpeg";
    full = out.data;
    width = out.info.width;
    height = out.info.height;
  }
  const thumb = await sharp(input).rotate().resize(THUMB_EDGE, THUMB_EDGE, { fit: "cover" }).webp({ quality: 75 }).toBuffer();
  return { full, fullType, thumb, width, height };
}

export type ImageVariant = "full" | "thumb";
export const imageKey = (id: string, variant: ImageVariant) => `images/${id}/${variant}`;
export const imageKeys = (id: string) => [imageKey(id, "full"), imageKey(id, "thumb")];

export async function saveImageFiles(id: string, img: { full: Buffer; fullType: string; thumb: Buffer }) {
  await Promise.all([putObject(imageKey(id, "full"), img.full, img.fullType), putObject(imageKey(id, "thumb"), img.thumb, "image/webp")]);
}

export const readImageFile = (id: string, variant: ImageVariant) => getObject(imageKey(id, variant));
export { deleteObjects };
