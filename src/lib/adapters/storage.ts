import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Stub object storage — writes to /public/uploads and returns a public path.
 * Swap for S3/R2/GCS: same signature, return the CDN URL.
 */

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export async function saveUpload(file: File): Promise<{
  url: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const name = `${randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, name), buf);
  return {
    url: `/uploads/${name}`,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: buf.length,
  };
}
