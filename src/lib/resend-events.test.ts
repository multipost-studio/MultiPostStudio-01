import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { effectOf, mergeStatus, verifySvix } from "./resend-events";

const SECRET_RAW = Buffer.from("super-secret-signing-key-123456").toString("base64");
const SECRET = `whsec_${SECRET_RAW}`;
const NOW = 1_800_000_000_000;
const sign = (id: string, ts: string, body: string, secret = SECRET_RAW) => `v1,${createHmac("sha256", Buffer.from(secret, "base64")).update(`${id}.${ts}.${body}`).digest("base64")}`;
const ts = String(NOW / 1000);
const body = JSON.stringify({ type: "email.delivered", data: { email_id: "e1" } });

describe("verifySvix", () => {
  it("accepts a correctly signed, fresh request", () => {
    expect(verifySvix(SECRET, { id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body) }, body, NOW)).toBe(true);
  });
  it("accepts any of several space-separated signatures (secret rotation)", () => {
    expect(verifySvix(SECRET, { id: "msg_1", timestamp: ts, signature: `v1,AAAA ${sign("msg_1", ts, body)}` }, body, NOW)).toBe(true);
  });
  it("rejects a changed body, id, timestamp or secret", () => {
    const good = sign("msg_1", ts, body);
    expect(verifySvix(SECRET, { id: "msg_1", timestamp: ts, signature: good }, body + " ", NOW)).toBe(false);
    expect(verifySvix(SECRET, { id: "msg_2", timestamp: ts, signature: good }, body, NOW)).toBe(false);
    expect(verifySvix(SECRET, { id: "msg_1", timestamp: String(NOW / 1000 + 1), signature: good }, body, NOW)).toBe(false);
    expect(verifySvix(`whsec_${Buffer.from("other").toString("base64")}`, { id: "msg_1", timestamp: ts, signature: good }, body, NOW)).toBe(false);
  });
  it("rejects a replay outside the five minute window, either direction", () => {
    const old = String(NOW / 1000 - 301);
    const future = String(NOW / 1000 + 301);
    expect(verifySvix(SECRET, { id: "m", timestamp: old, signature: sign("m", old, body) }, body, NOW)).toBe(false);
    expect(verifySvix(SECRET, { id: "m", timestamp: future, signature: sign("m", future, body) }, body, NOW)).toBe(false);
    const edge = String(NOW / 1000 - 299);
    expect(verifySvix(SECRET, { id: "m", timestamp: edge, signature: sign("m", edge, body) }, body, NOW)).toBe(true);
  });
  it("rejects missing headers, an empty secret, wrong versions and garbage", () => {
    const sig = sign("m", ts, body);
    expect(verifySvix(SECRET, { id: null, timestamp: ts, signature: sig }, body, NOW)).toBe(false);
    expect(verifySvix(SECRET, { id: "m", timestamp: null, signature: sig }, body, NOW)).toBe(false);
    expect(verifySvix(SECRET, { id: "m", timestamp: ts, signature: null }, body, NOW)).toBe(false);
    expect(verifySvix("", { id: "m", timestamp: ts, signature: sig }, body, NOW)).toBe(false);
    expect(verifySvix(SECRET, { id: "m", timestamp: ts, signature: sig.replace("v1,", "v2,") }, body, NOW)).toBe(false);
    expect(verifySvix(SECRET, { id: "m", timestamp: "abc", signature: sig }, body, NOW)).toBe(false);
    expect(verifySvix(SECRET, { id: "m", timestamp: ts, signature: "v1," }, body, NOW)).toBe(false);
  });
});

describe("effectOf and mergeStatus", () => {
  it("maps the events we track and ignores the rest", () => {
    expect(effectOf("email.delivered")).toEqual({ status: "delivered" });
    expect(effectOf("email.bounced")).toEqual({ status: "bounced" });
    expect(effectOf("email.complained")).toEqual({ status: "complained" });
    expect(effectOf("email.opened")).toEqual({ opened: true });
    expect(effectOf("email.clicked")).toEqual({ clicked: true });
    expect(effectOf("email.sent")).toBeNull();
    expect(effectOf("domain.updated")).toBeNull();
  });
  it("never moves a row back to a milder state", () => {
    expect(mergeStatus("sent", "delivered")).toBe("delivered");
    expect(mergeStatus("bounced", "delivered")).toBe("bounced");
    expect(mergeStatus("complained", "bounced")).toBe("complained");
    expect(mergeStatus("delivered", "delivered")).toBe("delivered");
    expect(mergeStatus("failed", "delivered")).toBe("failed");
  });
});
