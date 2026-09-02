import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

/**
 * AES-256-GCM encryption for OAuth tokens at rest.
 * Key: TOKEN_ENC_KEY (base64 of 32 bytes) if set, else derived from AUTH_SECRET
 * (fine for dev / single-tenant; set an explicit key in production).
 *
 * Format: base64( iv[12] | authTag[16] | ciphertext )
 */
function key(): Buffer {
  if (env.TOKEN_ENC_KEY) {
    const k = Buffer.from(env.TOKEN_ENC_KEY, "base64");
    if (k.length === 32) return k;
  }
  return createHash("sha256").update(`cadence:token-enc:${env.AUTH_SECRET}`).digest();
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptToken(blob: string): string {
  const buf = Buffer.from(blob, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** Legacy/stub tokens were stored as `stub_…` plaintext — detect & pass through. */
export function readToken(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (stored.startsWith("stub_")) return stored;
  try {
    return decryptToken(stored);
  } catch {
    return null;
  }
}

export function isRealToken(stored: string | null | undefined): boolean {
  const t = readToken(stored);
  return !!t && !t.startsWith("stub_");
}
