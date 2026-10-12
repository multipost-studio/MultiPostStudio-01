import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({
  flags: { emailProvider: "none" as string },
  active: new Map<string, { subject: string; body: string; version: number } | null>(),
  sendMail: vi.fn(),
  logs: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/env", () => ({
  env: { GMAIL_USER: "app@gmail.test", GMAIL_APP_PASSWORD: "x", EMAIL_FROM: "x", RESEND_API_KEY: undefined },
  flags: st.flags,
  appUrl: (p = "") => `https://app.test${p}`,
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/settings", () => ({
  getSettings: async () => ({ emailVerifySubject: "Site verify subject", emailVerifyBody: "Site body {name} {link}", emailResetSubject: "Site reset subject", emailResetBody: "Site reset {link}" }),
}));
vi.mock("@/lib/email-template-store", () => ({ activeTemplate: async (k: string) => st.active.get(k) ?? null }));
vi.mock("nodemailer", () => ({ createTransport: () => ({ sendMail: (...a: unknown[]) => st.sendMail(...a) }) }));
vi.mock("@/lib/db", () => ({ db: { emailLog: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { st.logs.push(data); return {}; }) } } }));

import { sendInviteEmail, sendNotificationEmail, sendPasswordResetEmail, sendVerificationEmail } from "./email";

beforeEach(() => {
  vi.clearAllMocks();
  st.logs.length = 0;
  st.active.clear();
  st.flags.emailProvider = "none";
  st.sendMail.mockResolvedValue({ messageId: "gm_1" });
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("verification and reset emails", () => {
  it("fall back to the site settings when no version is published", async () => {
    await sendVerificationEmail("a@b.co", "tok", "Sam");
    await sendPasswordResetEmail("a@b.co", "tok");
    await flush();
    expect(st.logs.map((l) => l.template)).toEqual(["verify", "reset"]);
  });

  it("use a published version, filling only the allowed placeholders", async () => {
    st.flags.emailProvider = "gmail";
    st.active.set("verify", { subject: "Welcome {name}", body: "Confirm: {link} {other}", version: 2 });
    await sendVerificationEmail("a@b.co", "tok123", "Sam");
    const mail = st.sendMail.mock.calls[0][0];
    expect(mail.subject).toBe("Welcome Sam");
    expect(mail.text).toBe("Confirm: https://app.test/verify?token=tok123 {other}");
  });

  it("a subject with a line break can never become a second header", async () => {
    st.flags.emailProvider = "gmail";
    st.active.set("reset", { subject: "Reset\r\nBcc: evil@example.com", body: "{link}", version: 1 });
    await sendPasswordResetEmail("a@b.co", "tok");
    expect(st.sendMail.mock.calls[0][0].subject).toBe("Reset Bcc: evil@example.com");
    expect(st.sendMail.mock.calls[0][0].subject).not.toMatch(/[\r\n]/);
  });
});

describe("invitations", () => {
  const base = { to: "a@b.co", name: "Alex", orgName: "Acme", inviterName: "Sam", role: "editor" };

  it("pick the new-account or existing-account template and render the built-in text with real values", async () => {
    st.flags.emailProvider = "gmail";
    await sendInviteEmail({ ...base, token: "tk" });
    await sendInviteEmail({ ...base });
    const [a, b] = st.sendMail.mock.calls.map((c) => c[0]);
    expect(a.subject).toBe("Sam added you to Acme on MultiPost Studio");
    expect(a.text).toContain("Hi Alex,");
    expect(a.text).toContain("Choose a password");
    expect(a.text).toContain("https://app.test/reset?token=tk");
    expect(b.text).toContain("existing MultiPost Studio password");
    expect(b.text).toContain("https://app.test/login");
  });

  it("use a published version of the right template only", async () => {
    st.flags.emailProvider = "gmail";
    st.active.set("invite_existing", { subject: "{org} needs you", body: "{inviter} says hi {name} → {link}", version: 1 });
    await sendInviteEmail({ ...base, token: "tk" });
    await sendInviteEmail({ ...base });
    const [a, b] = st.sendMail.mock.calls.map((c) => c[0]);
    expect(a.subject).toBe("Sam added you to Acme on MultiPost Studio");
    expect(b.subject).toBe("Acme needs you");
    expect(b.text).toBe("Sam says hi Alex → https://app.test/login");
  });

  it("an invitee without a name is greeted as 'there'", async () => {
    st.flags.emailProvider = "gmail";
    await sendInviteEmail({ ...base, name: null });
    expect(st.sendMail.mock.calls[0][0].text).toContain("Hi there,");
  });
});

describe("the delivery log", () => {
  it("records sent emails with the provider's id and no address or content", async () => {
    st.flags.emailProvider = "gmail";
    await sendVerificationEmail("secret@person.example", "tok", "Sam");
    await flush();
    expect(st.logs).toEqual([{ template: "verify", status: "sent", providerId: "gm_1", error: null }]);
    expect(JSON.stringify(st.logs)).not.toContain("secret@person.example");
    expect(JSON.stringify(st.logs)).not.toContain("tok");
  });

  it("records a failure, and a stub send when no provider is configured", async () => {
    st.flags.emailProvider = "gmail";
    st.sendMail.mockRejectedValue(new Error("auth failed"));
    expect(await sendVerificationEmail("a@b.co", "tok")).toMatchObject({ ok: false });
    st.flags.emailProvider = "none";
    await sendPasswordResetEmail("a@b.co", "tok");
    await flush();
    expect(st.logs.map((l) => [l.template, l.status])).toEqual([["verify", "failed"], ["reset", "stub"]]);
  });

  it("labels notification-style emails, defaulting to 'notification'", async () => {
    await sendNotificationEmail({ to: "a@b.co", title: "t", body: "b" });
    await sendNotificationEmail({ template: "digest", to: "a@b.co", title: "t", body: "b" });
    await flush();
    expect(st.logs.map((l) => l.template)).toEqual(["notification", "digest"]);
  });

  it("a failing log write never breaks or delays the email", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.emailLog.create).mockRejectedValueOnce(new Error("relation does not exist") as never);
    await expect(sendPasswordResetEmail("a@b.co", "tok")).resolves.toMatchObject({ ok: true });
  });
});
