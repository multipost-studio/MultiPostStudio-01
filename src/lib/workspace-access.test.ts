import { describe, it, expect } from "vitest";
import { canOpenWorkspace } from "./rbac";
import { membersWithoutAnyWorkspace } from "./workspace-access";

describe("canOpenWorkspace", () => {
  it("an open workspace is for every member, with or without a workspace row", () => {
    for (const role of ["owner", "admin", "manager", "editor", "creator", "analyst", "viewer"]) {
      expect(canOpenWorkspace(role, false, false)).toBe(true);
    }
  });

  it("a restricted workspace always admits owners and admins, so an org can never lock itself out", () => {
    expect(canOpenWorkspace("owner", true, false)).toBe(true);
    expect(canOpenWorkspace("admin", true, false)).toBe(true);
  });

  it("a restricted workspace admits everyone else only through a workspace row", () => {
    for (const role of ["manager", "editor", "creator", "analyst", "viewer"]) {
      expect(canOpenWorkspace(role, true, false)).toBe(false);
      expect(canOpenWorkspace(role, true, true)).toBe(true);
    }
  });
});

describe("membersWithoutAnyWorkspace", () => {
  const members = [
    { userId: "owner", role: "owner" },
    { userId: "ana", role: "editor" },
    { userId: "bo", role: "viewer" },
  ];

  it("is empty while every workspace is open", () => {
    const ws = [{ id: "a", restricted: false }, { id: "b", restricted: false }];
    expect(membersWithoutAnyWorkspace(ws, [], members)).toEqual([]);
  });

  it("finds someone whose only workspaces are restricted and who was not added", () => {
    const ws = [{ id: "a", restricted: true }, { id: "b", restricted: true }];
    const rows = [{ workspaceId: "a", userId: "ana" }];
    expect(membersWithoutAnyWorkspace(ws, rows, members)).toEqual(["bo"]);
  });

  it("an open workspace elsewhere is enough", () => {
    const ws = [{ id: "a", restricted: true }, { id: "b", restricted: false }];
    expect(membersWithoutAnyWorkspace(ws, [], members)).toEqual([]);
  });

  it("never reports owners or admins", () => {
    const ws = [{ id: "a", restricted: true }];
    expect(membersWithoutAnyWorkspace(ws, [], [{ userId: "o", role: "owner" }, { userId: "ad", role: "admin" }])).toEqual([]);
  });

  it("an org with no workspace at all has nothing to open for anyone (the caller never asks in that state)", () => {
    expect(membersWithoutAnyWorkspace([], [], members)).toEqual(["owner", "ana", "bo"]);
  });
});
