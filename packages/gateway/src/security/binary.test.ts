import { describe, it, expect } from "vitest";
import { isBinaryAllowed } from "./binary.js";

describe("binary allowlist", () => {
  const allowlist = ["git", "node", "npm", "pnpm", "ls", "cat"];

  describe("allows whitelisted binaries", () => {
    it("allows git", () => {
      expect(isBinaryAllowed("git", allowlist)).toBe(true);
    });

    it("allows node", () => {
      expect(isBinaryAllowed("node", allowlist)).toBe(true);
    });

    it("allows full path — extracts basename", () => {
      expect(isBinaryAllowed("/usr/bin/git", allowlist)).toBe(true);
    });

    it("allows Windows-style path", () => {
      expect(
        isBinaryAllowed("C:\\Program Files\\nodejs\\node", allowlist)
      ).toBe(true);
    });
  });

  describe("blocks unauthorized binaries", () => {
    it("blocks rm", () => {
      expect(isBinaryAllowed("rm", allowlist)).toBe(false);
    });

    it("blocks curl", () => {
      expect(isBinaryAllowed("curl", allowlist)).toBe(false);
    });

    it("blocks wget", () => {
      expect(isBinaryAllowed("wget", allowlist)).toBe(false);
    });

    it("blocks python", () => {
      expect(isBinaryAllowed("python", allowlist)).toBe(false);
    });

    it("blocks bash", () => {
      expect(isBinaryAllowed("bash", allowlist)).toBe(false);
    });

    it("blocks full path to unauthorized binary", () => {
      expect(isBinaryAllowed("/usr/bin/rm", allowlist)).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("empty allowlist blocks everything", () => {
      expect(isBinaryAllowed("git", [])).toBe(false);
    });
  });
});
