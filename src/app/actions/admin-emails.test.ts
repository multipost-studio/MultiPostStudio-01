import { beforeEach, describe, expect, it, vi } from "vitest";

const mail = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/events", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireAdminPermission: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(), RateLimitError: class RateLimitError extends Error {} }));
vi.mock("@/lib/email-template-store", () => ({ invalidateEmailTemplates: vi.fn() }));
vi.mock("@/lib/adapters/email", () => ({ sendGenericEmail: (...a: unknown[]) => mail.send(...a) }));
vi.mock("@/lib/db", () => ({
  db: {
    emailTemplateVersion: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn((a: unknown) => ({ op: "create", a })), updateMany: vi.fn((a: unknown) => ({ op: "updateMany", a })) },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}));

import { db } from "@/lib/db";
import { logAudit } from "@/lib/events";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { invalidateEmailTemplates } from "@/lib/email-template-store";
import { requireAdminPermission } from "@/lib/session";
import { publishEmailTemplateAction, resetEmailTemplateAction, restoreEmailTemplateVersionAction, sendTestEmailAction } from "./admin-emails";

const REASON = "Clearer wording for new users";
const good = { key: "verify", subject: "Welcome, {name}", body: "Confirm here: {link}" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdminPermission).mockResolvedValue({ id: "s1", email: "staff@example.com" } as never);
  vi.mocked(db.emailTemplateVersion.findFirst).mockResolvedValue({ version: 3 } as never);
  mail.send.mockResolvedValue({ ok: true });
  vi.mocked(enforceRateLimit).mockResolvedValue(undefined as never);
});

describe("publishEmailTemplateAction", () => {
  it("needs marketing.manage and a reason", async () => {
    vi.mocked(requireAdminPermission).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(publishEmailTemplateAction(good, REASON)).rejects.toThrow("NEXT_REDIRECT");
    expect(requireAdminPermission).toHaveBeenCalledWith("marketing.manage");
    vi.mocked(requireAdminPermission).mockResolvedValue({ id: "s1" } as never);
    for (const bad of [undefined, "", "short"]) expect(await publishEmailTemplateAction(good, bad)).toMatchObject({ ok: false });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("adds the next version as the only active one, in one transaction, and clears the cache", async () => {
    expect(await publishEmailTemplateAction(good, REASON)).toMatchObject({ ok: true, message: "Version 4 is live" });
    const ops = vi.mocked(db.$transaction).mock.calls[0][0] as unknown as { op: string; a: { where?: unknown; data: Record<string, unknown> } }[];
    expect(ops[0]).toMatchObject({ op: "updateMany", a: { where: { key: "verify", isActive: true }, data: { isActive: false } } });
    expect(ops[1].a.data).toMatchObject({ key: "verify", version: 4, subject: "Welcome, {name}", body: "Confirm here: {link}", isActive: true, createdById: "s1", note: REASON });
    expect(invalidateEmailTemplates).toHaveBeenCalled();
    const audit = vi.mocked(logAudit).mock.calls[0][0];
    expect(audit).toMatchObject({ action: "admin.email_template_published", targetId: "verify", reason: REASON, metadata: { version: 4 } });
    expect(JSON.stringify(audit)).not.toContain("Confirm here");
  });

  it("the first version is 1", async () => {
    vi.mocked(db.emailTemplateVersion.findFirst).mockResolvedValue(null as never);
    expect(await publishEmailTemplateAction(good, REASON)).toMatchObject({ message: "Version 1 is live" });
  });

  it("refuses an invalid version: missing link, unknown placeholder, multi-line subject, unknown template", async () => {
    for (const bad of [
      { ...good, body: "no link" },
      { ...good, subject: "Hi {nmae}" },
      { ...good, subject: "Hi\nBcc: evil@example.com" },
      { ...good, key: "welcome" },
      { ...good, subject: "" },
      { key: "verify" },
    ]) {
      expect(await publishEmailTemplateAction(bad as never, REASON)).toMatchObject({ ok: false });
    }
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("restoreEmailTemplateVersionAction", () => {
  it("publishes the old version again as the newest, leaving the history alone", async () => {
    vi.mocked(db.emailTemplateVersion.findUnique).mockResolvedValue({ id: "v1", key: "reset", version: 2, subject: "Reset", body: "Go {link}" } as never);
    expect(await restoreEmailTemplateVersionAction("v1", REASON)).toMatchObject({ ok: true, message: "Version 2 restored as version 4" });
    const ops = vi.mocked(db.$transaction).mock.calls[0][0] as unknown as { a: { data: Record<string, unknown> } }[];
    expect(ops[1].a.data).toMatchObject({ key: "reset", version: 4, subject: "Reset", body: "Go {link}", isActive: true });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.email_template_restored", metadata: { restoredVersion: 2, version: 4 } }));
  });

  it("re-checks an old version against today's rules, and refuses unknown versions and bad input", async () => {
    vi.mocked(db.emailTemplateVersion.findUnique).mockResolvedValue({ id: "v1", key: "reset", version: 2, subject: "Reset", body: "no link" } as never);
    expect(await restoreEmailTemplateVersionAction("v1", REASON)).toMatchObject({ ok: false });
    vi.mocked(db.emailTemplateVersion.findUnique).mockResolvedValue(null as never);
    expect(await restoreEmailTemplateVersionAction("nope", REASON)).toMatchObject({ ok: false });
    expect(await restoreEmailTemplateVersionAction("", REASON)).toMatchObject({ ok: false });
    expect(await restoreEmailTemplateVersionAction("v1", "x")).toMatchObject({ ok: false });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("resetEmailTemplateAction", () => {
  it("deactivates the live version only", async () => {
    vi.mocked(db.emailTemplateVersion.updateMany).mockResolvedValue({ count: 1 } as never);
    expect(await resetEmailTemplateAction("verify", REASON)).toMatchObject({ ok: true });
    expect(db.emailTemplateVersion.updateMany).toHaveBeenCalledWith({ where: { key: "verify", isActive: true }, data: { isActive: false } });
    expect(invalidateEmailTemplates).toHaveBeenCalled();
  });
  it("says so when it is already the built-in text, and rejects unknown keys and missing reasons", async () => {
    vi.mocked(db.emailTemplateVersion.updateMany).mockResolvedValue({ count: 0 } as never);
    expect(await resetEmailTemplateAction("verify", REASON)).toMatchObject({ ok: false });
    expect(await resetEmailTemplateAction("nope", REASON)).toMatchObject({ ok: false });
    expect(await resetEmailTemplateAction("verify", "")).toMatchObject({ ok: false });
  });
});

describe("sendTestEmailAction", () => {
  it("sends sample text only to the signed-in admin's own address, never anyone else", async () => {
    expect(await sendTestEmailAction("invite_new", { subject: "{inviter} invited you", body: "Join {org}: {link}" })).toMatchObject({ ok: true });
    const sent = mail.send.mock.calls[0][0];
    expect(sent.to).toBe("staff@example.com");
    expect(sent.subject).toBe("[Test] Sam invited you");
    expect(sent.text).toContain("Join Acme Studio: https://app.example.com/example-link");
    expect(sent.template).toBe("test");
  });

  it("escapes the body in the HTML part", async () => {
    await sendTestEmailAction("verify", { subject: "Hi", body: "<script>x</script> {link}" });
    expect(mail.send.mock.calls[0][0].html).toContain("&lt;script&gt;");
    expect(mail.send.mock.calls[0][0].html).not.toContain("<script>");
  });

  it("without a draft it sends the built-in text; an invalid draft, unknown key and a rate limit are refused", async () => {
    expect(await sendTestEmailAction("reset")).toMatchObject({ ok: true });
    expect(await sendTestEmailAction("reset", { subject: "x", body: "no link" })).toMatchObject({ ok: false });
    expect(await sendTestEmailAction("nope")).toMatchObject({ ok: false });
    vi.mocked(enforceRateLimit).mockRejectedValue(new RateLimitError(Date.now()));
    expect(await sendTestEmailAction("reset")).toMatchObject({ ok: false, error: expect.stringMatching(/test emails/) });
    expect(mail.send).toHaveBeenCalledTimes(1);
  });

  it("reports a provider refusal honestly", async () => {
    mail.send.mockResolvedValue({ ok: false });
    expect(await sendTestEmailAction("reset")).toMatchObject({ ok: false });
  });
});
