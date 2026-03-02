import { describe, it, expect, beforeEach, vi } from "vitest";
import { ApprovalManager } from "./approval.js";

describe("ApprovalManager", () => {
  let mgr: ApprovalManager;

  beforeEach(() => {
    mgr = new ApprovalManager();
  });

  describe("pre-approved users", () => {
    it("marks pre-approved users as approved", () => {
      const mgr2 = new ApprovalManager([111, 222, 333]);
      expect(mgr2.isApproved(111)).toBe(true);
      expect(mgr2.isApproved(222)).toBe(true);
      expect(mgr2.isApproved(333)).toBe(true);
      expect(mgr2.isApproved(444)).toBe(false);
    });
  });

  describe("approval flow", () => {
    it("generates a 6-digit code", () => {
      const code = mgr.generateCode(100);
      expect(code).toMatch(/^\d{6}$/);
    });

    it("verifies correct code", () => {
      const code = mgr.generateCode(100);
      expect(mgr.verify(100, code)).toBe(true);
      expect(mgr.isApproved(100)).toBe(true);
    });

    it("rejects wrong code", () => {
      mgr.generateCode(100);
      expect(mgr.verify(100, "000000")).toBe(false);
      expect(mgr.isApproved(100)).toBe(false);
    });

    it("blocks user after 3 failed attempts", () => {
      mgr.generateCode(100);
      expect(mgr.verify(100, "wrong1")).toBe(false);
      expect(mgr.verify(100, "wrong2")).toBe(false);
      expect(mgr.verify(100, "wrong3")).toBe(false);
      expect(mgr.isBlocked(100)).toBe(true);
    });

    it("returns empty code for already approved user", () => {
      const mgr2 = new ApprovalManager([100]);
      expect(mgr2.generateCode(100)).toBe("");
    });

    it("returns empty code for blocked user", () => {
      mgr.generateCode(100);
      mgr.verify(100, "x");
      mgr.verify(100, "x");
      mgr.verify(100, "x");
      expect(mgr.generateCode(100)).toBe("");
    });

    it("verify returns false for unknown user", () => {
      expect(mgr.verify(999, "123456")).toBe(false);
    });
  });

  describe("code expiry", () => {
    it("rejects expired code", () => {
      vi.useFakeTimers();
      const code = mgr.generateCode(100);

      // Advance 6 minutes (past 5-minute TTL)
      vi.advanceTimersByTime(6 * 60 * 1000);

      expect(mgr.verify(100, code)).toBe(false);
      expect(mgr.isApproved(100)).toBe(false);

      vi.useRealTimers();
    });
  });

  describe("manual approve/revoke", () => {
    it("manually approves a user", () => {
      mgr.manualApprove(200);
      expect(mgr.isApproved(200)).toBe(true);
    });

    it("manual approve clears blocked status", () => {
      mgr.generateCode(200);
      mgr.verify(200, "x");
      mgr.verify(200, "x");
      mgr.verify(200, "x");
      expect(mgr.isBlocked(200)).toBe(true);

      mgr.manualApprove(200);
      expect(mgr.isBlocked(200)).toBe(false);
      expect(mgr.isApproved(200)).toBe(true);
    });

    it("revokes approval", () => {
      mgr.manualApprove(300);
      expect(mgr.isApproved(300)).toBe(true);
      mgr.revoke(300);
      expect(mgr.isApproved(300)).toBe(false);
    });
  });

  describe("status", () => {
    it("returns status summary", () => {
      mgr.manualApprove(100);
      mgr.generateCode(200);
      mgr.generateCode(300);
      mgr.verify(300, "x");
      mgr.verify(300, "x");
      mgr.verify(300, "x");

      const status = mgr.status();
      expect(status.approved).toContain(100);
      expect(status.pending).toContain(200);
      expect(status.blocked).toContain(300);
    });
  });
});
