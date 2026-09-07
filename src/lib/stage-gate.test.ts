import { describe, it, expect } from "vitest";
import { canActAtStage } from "./rbac";
import { WORKSPACE_ROLES } from "./constants";

/**
 * ApprovalStage.roleGate gates who may act at a stage. decideApprovalAction
 * previously checked only the generic `content.approve` permission, so any
 * approver could clear a manager-only or client-only stage.
 */
describe("canActAtStage", () => {
  it("lets a role satisfy its own gate", () => {
    for (const r of WORKSPACE_ROLES) {
      expect(canActAtStage(r, r), `${r} should satisfy its own gate`).toBe(true);
    }
  });

  it("lets higher authority satisfy a lower gate", () => {
    expect(canActAtStage("owner", "manager")).toBe(true);
    expect(canActAtStage("admin", "manager")).toBe(true);
    expect(canActAtStage("manager", "editor")).toBe(true);
    expect(canActAtStage("editor", "creator")).toBe(true);
    expect(canActAtStage("manager", "viewer")).toBe(true);
  });

  it("refuses lower authority on a higher gate", () => {
    expect(canActAtStage("editor", "manager")).toBe(false);
    expect(canActAtStage("creator", "manager")).toBe(false);
    expect(canActAtStage("viewer", "editor")).toBe(false);
    expect(canActAtStage("analyst", "manager")).toBe(false);
  });

  describe("client is a distinct role, not a rank", () => {
    it("only a client can clear a client-gated stage", () => {
      expect(canActAtStage("client", "client")).toBe(true);
      // Seniority must not let staff sign off on the client's behalf.
      expect(canActAtStage("owner", "client")).toBe(false);
      expect(canActAtStage("admin", "client")).toBe(false);
      expect(canActAtStage("manager", "client")).toBe(false);
    });

    it("a client cannot clear an internal stage", () => {
      expect(canActAtStage("client", "manager")).toBe(false);
      expect(canActAtStage("client", "editor")).toBe(false);
      expect(canActAtStage("client", "viewer")).toBe(false);
    });
  });

  describe("fails closed", () => {
    it("rejects missing role or gate", () => {
      expect(canActAtStage(null, "manager")).toBe(false);
      expect(canActAtStage(undefined, "manager")).toBe(false);
      expect(canActAtStage("manager", null)).toBe(false);
      expect(canActAtStage("manager", undefined)).toBe(false);
      expect(canActAtStage("", "")).toBe(false);
    });

    it("rejects unknown roles and gates rather than allowing them", () => {
      expect(canActAtStage("superuser", "manager")).toBe(false);
      expect(canActAtStage("manager", "superuser")).toBe(false);
      expect(canActAtStage("MANAGER", "manager")).toBe(false); // case-sensitive on purpose
    });
  });

  it("covers every gate the stage editor can produce", () => {
    // The UI offers WORKSPACE_ROLES as gates; none may be silently unhandled.
    for (const gate of WORKSPACE_ROLES) {
      const anySatisfies = [...WORKSPACE_ROLES, "owner", "admin"].some((r) => canActAtStage(r, gate));
      expect(anySatisfies, `no role can satisfy gate "${gate}"`).toBe(true);
    }
  });
});
