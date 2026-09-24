/**
 * Bounded remote fetch: Content-Length pre-check + timeout + hard byte cap.
 * Prevents a malicious/oversized media URL from OOMing the serverless
 * function via unbounded arrayBuffer(), and stops slow providers from
 * holding the publish tick open. Never throws sensitive internals — callers
 * surface a short message.
 */
export async function fetchBytesWithLimit(
  url: string,
  opts: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const maxBytes = opts.maxBytes ?? 128 * 1024 * 1024;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const announced = Number(res.headers.get("content-length") ?? 0);
    if (Number.isFinite(announced) && announced > 0 && announced > maxBytes) {
      try {
        await res.arrayBuffer().catch(() => undefined);
      } catch {
        /* drain best-effort */
      }
      throw new Error(`remote file too large (${announced} bytes)`);
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new Error(`remote file too large (${buf.length} bytes)`);
    return { bytes: buf, contentType: res.headers.get("content-type") ?? "application/octet-stream" };
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw new Error("remote fetch timed out");
    throw e instanceof Error ? e : new Error(String(e));
  } finally {
    clearTimeout(t);
  }
}
