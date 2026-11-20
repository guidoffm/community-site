import path from "node:path"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"

/**
 * Objektspeicher für Bilder.
 * - S3_BUCKET gesetzt → S3-kompatibler Dienst (MinIO im Cluster, Ceph RGW, AWS, …)
 * - sonst → lokales Verzeichnis UPLOAD_DIR (nur für Entwicklung gedacht)
 */
const BUCKET = process.env.S3_BUCKET || ""
const LOCAL_DIR = path.resolve(process.env.UPLOAD_DIR ?? "./uploads")

const s3 = BUCKET
  ? new S3Client({
      endpoint: process.env.S3_ENDPOINT || undefined,
      region: process.env.S3_REGION || "us-east-1",
      forcePathStyle: true, // MinIO & Co. arbeiten mit Path-Style-URLs
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? "",
        secretAccessKey: process.env.S3_SECRET_KEY ?? "",
      },
    })
  : null

let bucketReady: Promise<void> | null = null
function ensureBucket() {
  bucketReady ??= (async () => {
    try {
      await s3!.send(new HeadBucketCommand({ Bucket: BUCKET }))
    } catch {
      await s3!.send(new CreateBucketCommand({ Bucket: BUCKET }))
    }
  })().catch((err) => {
    bucketReady = null
    throw err
  })
  return bucketReady
}

function assertKey(key: string) {
  if (!/^[a-z]+\/[0-9a-f-]{36}\/[a-z]+$/.test(key)) throw new Error(`Ungültiger Objekt-Key: ${key}`)
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  assertKey(key)
  if (s3) {
    await ensureBucket()
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }))
  } else {
    const file = path.join(LOCAL_DIR, key)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, body)
  }
}

export async function getObject(key: string): Promise<Buffer | null> {
  assertKey(key)
  if (s3) {
    try {
      const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
      return res.Body ? Buffer.from(await res.Body.transformToByteArray()) : null
    } catch (err) {
      if (err instanceof NoSuchKey) return null
      throw err
    }
  }
  return readFile(path.join(LOCAL_DIR, key)).catch(() => null)
}

export async function deleteObjects(keys: string[]) {
  if (keys.length === 0) return
  keys.forEach(assertKey)
  if (s3) {
    for (let i = 0; i < keys.length; i += 1000) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: BUCKET,
          Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
        }),
      )
    }
  } else {
    await Promise.all(keys.map((k) => rm(path.join(LOCAL_DIR, k), { force: true })))
  }
}
