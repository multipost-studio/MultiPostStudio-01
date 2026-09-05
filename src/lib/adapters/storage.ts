import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env, flags } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Object storage. Uploads to any S3-compatible store when S3_BUCKET +
 * credentials are set — AWS S3, Supabase Storage, Cloudflare R2, DigitalOcean
 * Spaces, MinIO. Set S3_ENDPOINT for non-AWS stores (path-style addressing is
 * then used automatically). Without credentials it writes to /public/uploads,
 * which only works on a writable filesystem (local dev — NOT Vercel/serverless).
 * Same signature either way — callers never change.
 */

export type StoredFile = {
  url: string;
  key: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
};

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

function keyFor(name: string) {
  const ext = name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "bin";
  const d = new Date();
  return `uploads/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${ext}`;
}

async function s3client() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({
    region: env.S3_REGION,
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    },
  });
}

function publicUrl(key: string) {
  const base =
    env.S3_PUBLIC_URL ??
    (env.S3_ENDPOINT
      ? `${env.S3_ENDPOINT.replace(/\/$/, "")}/${env.S3_BUCKET}`
      : `https://${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com`);
  return `${base.replace(/\/$/, "")}/${key}`;
}

/**
 * True only if `url` points at this app's own configured storage host.
 * Registration paths (registerMediaAction) accept a client-supplied url/thumbUrl
 * that this app itself never fetched — without this check, a client could point
 * a "media asset" at an arbitrary internal URL, which later gets re-fetched
 * server-side (bluesky.ts blob upload, publish.ts YouTube upload) and the
 * response bytes re-uploaded to whatever channel the client controls: a classic
 * SSRF exfil pivot. Real uploads (saveUpload) never need this — they always
 * write here first and hand back a url we generated ourselves.
 */
export function isOwnStorageUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (env.S3_PUBLIC_URL) {
    try {
      return u.hostname === new URL(env.S3_PUBLIC_URL).hostname;
    } catch {
      return false;
    }
  }
  if (env.S3_ENDPOINT) {
    try {
      return u.hostname === new URL(env.S3_ENDPOINT).hostname;
    } catch {
      return false;
    }
  }
  return u.hostname === `${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com`;
}

export async function saveUpload(file: File): Promise<StoredFile> {
  const buf = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";
  const key = keyFor(file.name);

  if (flags.realStorage) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = await s3client();
    await s3.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET!,
        Key: key,
        Body: buf,
        ContentType: mimeType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    return { url: publicUrl(key), key, filename: file.name, mimeType, sizeBytes: buf.length };
  }

  if (isServerless) {
    throw new Error(
      "File storage is not configured. Set S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, " +
        "S3_SECRET_ACCESS_KEY (and S3_ENDPOINT for Supabase/R2) so uploads can be stored.",
    );
  }

  // local dev — writable filesystem only
  const localName = key.split("/").pop()!;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, localName), buf);
  return { url: `/uploads/${localName}`, key: `uploads/${localName}`, filename: file.name, mimeType, sizeBytes: buf.length };
}

/** Presigned PUT URL for direct browser → S3 uploads (large files). */
export async function presignUpload(filename: string, contentType: string) {
  if (!flags.realStorage) return null;
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const s3 = await s3client();
  const key = keyFor(filename);
  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: env.S3_BUCKET!, Key: key, ContentType: contentType }),
    { expiresIn: 600 },
  );
  return { uploadUrl: url, key, publicUrl: publicUrl(key) };
}

export async function deleteUpload(key: string) {
  if (!flags.realStorage) return;
  try {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = await s3client();
    await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET!, Key: key }));
  } catch (e) {
    logger.warn({ err: e, key }, "storage delete failed");
  }
}
