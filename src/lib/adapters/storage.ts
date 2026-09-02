import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env, flags } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Object storage. Uploads to S3 (or any S3-compatible store: R2, Spaces, MinIO)
 * when S3_BUCKET + credentials are set; otherwise writes to /public/uploads for
 * local dev. Same signature either way — callers never change.
 */

export type StoredFile = {
  url: string;
  key: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
};

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

function keyFor(name: string) {
  const ext = name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "bin";
  const d = new Date();
  return `uploads/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${ext}`;
}

export async function saveUpload(file: File): Promise<StoredFile> {
  const buf = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";
  const key = keyFor(file.name);

  if (flags.realStorage) {
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = new S3Client({
      region: env.S3_REGION,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      },
    });
    await s3.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET!,
        Key: key,
        Body: buf,
        ContentType: mimeType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    const base = env.S3_PUBLIC_URL ?? `https://${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com`;
    return { url: `${base.replace(/\/$/, "")}/${key}`, key, filename: file.name, mimeType, sizeBytes: buf.length };
  }

  // local dev
  const localName = key.split("/").pop()!;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, localName), buf);
  return { url: `/uploads/${localName}`, key: `uploads/${localName}`, filename: file.name, mimeType, sizeBytes: buf.length };
}

/** Presigned PUT URL for direct browser → S3 uploads (large files). */
export async function presignUpload(filename: string, contentType: string) {
  if (!flags.realStorage) return null;
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const s3 = new S3Client({
    region: env.S3_REGION,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! },
  });
  const key = keyFor(filename);
  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: env.S3_BUCKET!, Key: key, ContentType: contentType }),
    { expiresIn: 600 },
  );
  const base = env.S3_PUBLIC_URL ?? `https://${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com`;
  return { uploadUrl: url, key, publicUrl: `${base.replace(/\/$/, "")}/${key}` };
}

export async function deleteUpload(key: string) {
  if (!flags.realStorage) return;
  try {
    const { S3Client, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = new S3Client({
      region: env.S3_REGION,
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! },
    });
    await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET!, Key: key }));
  } catch (e) {
    logger.warn({ err: e, key }, "storage delete failed");
  }
}
