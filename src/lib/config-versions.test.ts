import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/db", () => ({
  db: {
    systemSetting: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    configRevision: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { REVISIONS_KEPT_PER_KEY, deleteConfig, withRevisionMeta, writeConfig } from "./config-versions";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.systemSetting.findUnique).mockResolvedValue({ value: '{"a":1}' } as never);
  vi.mocked(db.configRevision.findMany).mockResolvedValue([] as never);
  vi.mocked(db.configRevision.create).mockResolvedValue({} as never);
});

describe("writeConfig", () => {
  it("saves the value and keeps the previous one as a revision", async () => {
    await writeConfig("site_branding", '{"a":2}', "admin1");
    expect(db.systemSetting.upsert).toHaveBeenCalledWith({ where: { key: "site_branding" }, create: { key: "site_branding", value: '{"a":2}', updatedBy: "admin1" }, update: { value: '{"a":2}', updatedBy: "admin1" } });
    expect(db.configRevision.create).toHaveBeenCalledWith({ data: { key: "site_branding", before: '{"a":1}', after: '{"a":2}', actorId: "admin1", reason: null, restoredFromId: null } });
  });

  it("records no revision when nothing changed", async () => {
    await writeConfig("site_branding", '{"a":1}', "admin1");
    expect(db.systemSetting.upsert).toHaveBeenCalled();
    expect(db.configRevision.create).not.toHaveBeenCalled();
  });

  it("the first save has no before", async () => {
    vi.mocked(db.systemSetting.findUnique).mockResolvedValue(null as never);
    await writeConfig("footer_config", '{"x":1}', "admin1");
    expect(vi.mocked(db.configRevision.create).mock.calls[0][0].data).toMatchObject({ before: null });
  });

  it("never blocks the save: a missing revisions table or a failed read is survived", async () => {
    vi.mocked(db.configRevision.create).mockRejectedValue(new Error("relation does not exist"));
    await expect(writeConfig("site_branding", '{"a":2}', "admin1")).resolves.toBeUndefined();
    vi.mocked(db.systemSetting.findUnique).mockRejectedValue(new Error("db blip"));
    await expect(writeConfig("site_branding", '{"a":3}', "admin1")).resolves.toBeUndefined();
    expect(db.systemSetting.upsert).toHaveBeenCalledTimes(2);
  });

  it("keeps only the newest revisions per key", async () => {
    vi.mocked(db.configRevision.findMany).mockResolvedValue([{ id: "old1" }, { id: "old2" }] as never);
    await writeConfig("site_branding", '{"a":2}', "admin1");
    expect(vi.mocked(db.configRevision.findMany).mock.calls[0][0]).toMatchObject({ where: { key: "site_branding" }, skip: REVISIONS_KEPT_PER_KEY });
    expect(db.configRevision.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["old1", "old2"] } } });
  });

  it("tags a write made during a restore with its reason and source", async () => {
    await withRevisionMeta({ reason: "Undo bad copy change", restoredFromId: "rev9" }, () => writeConfig("site_branding", '{"a":2}', "admin1"));
    expect(vi.mocked(db.configRevision.create).mock.calls[0][0].data).toMatchObject({ reason: "Undo bad copy change", restoredFromId: "rev9" });
    // and the tag does not leak into the next, unrelated write
    await writeConfig("site_branding", '{"a":5}', "admin1");
    expect(vi.mocked(db.configRevision.create).mock.calls[1][0].data).toMatchObject({ reason: null, restoredFromId: null });
  });
});

describe("deleteConfig", () => {
  it("records a reset as an empty after", async () => {
    await deleteConfig("site_branding", "admin1");
    expect(db.systemSetting.deleteMany).toHaveBeenCalledWith({ where: { key: "site_branding" } });
    expect(db.configRevision.create).toHaveBeenCalledWith({ data: { key: "site_branding", before: '{"a":1}', after: "", actorId: "admin1", reason: null, restoredFromId: null } });
  });

  it("records nothing when there was nothing to reset", async () => {
    vi.mocked(db.systemSetting.findUnique).mockResolvedValue(null as never);
    await deleteConfig("site_branding");
    expect(db.configRevision.create).not.toHaveBeenCalled();
  });
});
