import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db: { emailTemplateVersion: { findFirst: vi.fn() } } }));

import { db } from "@/lib/db";
import { activeTemplate, invalidateEmailTemplates } from "./email-template-store";

beforeEach(() => {
  vi.clearAllMocks();
  invalidateEmailTemplates();
  vi.mocked(db.emailTemplateVersion.findFirst).mockResolvedValue({ subject: "S", body: "B {link}", version: 2 } as never);
});

describe("activeTemplate", () => {
  it("reads the active version, and caches it briefly", async () => {
    expect(await activeTemplate("verify", 1000)).toEqual({ subject: "S", body: "B {link}", version: 2 });
    await activeTemplate("verify", 5000);
    expect(db.emailTemplateVersion.findFirst).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.emailTemplateVersion.findFirst).mock.calls[0][0]).toMatchObject({ where: { key: "verify", isActive: true } });
    await activeTemplate("verify", 40_000);
    expect(db.emailTemplateVersion.findFirst).toHaveBeenCalledTimes(2);
  });

  it("is null when nothing is published, and for keys that are not templates (without a query)", async () => {
    vi.mocked(db.emailTemplateVersion.findFirst).mockResolvedValue(null as never);
    expect(await activeTemplate("reset", 1000)).toBeNull();
    vi.mocked(db.emailTemplateVersion.findFirst).mockClear();
    expect(await activeTemplate("welcome", 1000)).toBeNull();
    expect(db.emailTemplateVersion.findFirst).not.toHaveBeenCalled();
  });

  it("never throws: a missing table or a database error means the built-in text, or the last known version", async () => {
    vi.mocked(db.emailTemplateVersion.findFirst).mockRejectedValue(new Error("relation does not exist"));
    expect(await activeTemplate("invite_new", 1000)).toBeNull();
    vi.mocked(db.emailTemplateVersion.findFirst).mockResolvedValue({ subject: "S", body: "B {link}", version: 1 } as never);
    expect(await activeTemplate("verify", 1000)).not.toBeNull();
    vi.mocked(db.emailTemplateVersion.findFirst).mockRejectedValue(new Error("db down"));
    expect(await activeTemplate("verify", 100_000)).toEqual({ subject: "S", body: "B {link}", version: 1 });
  });

  it("invalidation makes a new publish visible at once", async () => {
    await activeTemplate("verify", 1000);
    invalidateEmailTemplates();
    await activeTemplate("verify", 1500);
    expect(db.emailTemplateVersion.findFirst).toHaveBeenCalledTimes(2);
  });
});
