import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * TOTP (RFC 6238) on top of HOTP (RFC 4226) — standard 30s step, 6 digits,
 * HMAC-SHA1 (what every authenticator app — Google Authenticator, Authy, 1Password,
 * etc. — expects; TOTP's RFC explicitly specifies SHA-1 for interop, this is not
 * a "weak hash" mistake). No external OTP library needed — this is ~60 lines of
 * well-defined spec, not worth a dependency for.
 */

const STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Random 20-byte (160-bit) secret, base32-encoded — the standard TOTP secret size. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Exported for tests only — verifies against RFC 4226/6238 vectors below. */
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Exported for tests only. */
export function base32Decode(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Exported for tests only — the actual RFC 4226 HOTP algorithm, tested directly. */
export function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  // JS numbers are safe integers well past any realistic TOTP counter value
  // (counter = unix seconds / 30 — won't exceed 2^53 for millennia).
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 10 ** DIGITS).padStart(DIGITS, "0");
}

/**
 * Verifies a 6-digit code against the secret, allowing ±1 step (±30s) of clock
 * drift between the server and the user's phone — standard TOTP practice.
 */
export function verifyTotpCode(secret: string, code: string): boolean {
  const clean = String(code ?? "").trim();
  if (!/^\d{6}$/.test(clean)) return false;
  const key = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  for (const drift of [0, -1, 1]) {
    const c = counter + drift;
    if (c < 0) continue; // only reachable in tests pinning Date.now() near the epoch
    const expected = hotp(key, c);
    const a = Buffer.from(expected);
    const b = Buffer.from(clean);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

/** otpauth:// URI an authenticator app scans (via a QR code) to add the account. */
export function totpUri(secret: string, accountEmail: string, issuer = "MultiPost Studio"): string {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}
