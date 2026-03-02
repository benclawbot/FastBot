import { describe, it, expect } from "vitest";
import { isPathSafe } from "./path.js";
import { resolve } from "node:path";

describe("path safety", () => {
  const allowedRoots = [resolve("/tmp/workspace"), resolve("/home/user/data")];

  describe("allows paths within roots", () => {
    it("allows exact root", () => {
      expect(isPathSafe("/tmp/workspace", allowedRoots)).toBe(true);
    });

    it("allows subdirectory", () => {
      expect(isPathSafe("/tmp/workspace/file.txt", allowedRoots)).toBe(true);
    });

    it("allows nested subdirectory", () => {
      expect(
        isPathSafe("/tmp/workspace/deep/nested/file.js", allowedRoots)
      ).toBe(true);
    });

    it("allows second root", () => {
      expect(isPathSafe("/home/user/data/doc.pdf", allowedRoots)).toBe(true);
    });
  });

  describe("blocks path traversal", () => {
    it("blocks ../etc/passwd", () => {
      expect(
        isPathSafe("/tmp/workspace/../../etc/passwd", allowedRoots)
      ).toBe(false);
    });

    it("blocks absolute path outside roots", () => {
      expect(isPathSafe("/etc/passwd", allowedRoots)).toBe(false);
    });

    it("blocks sneaky traversal with dots", () => {
      expect(
        isPathSafe("/tmp/workspace/../../../root/.ssh/id_rsa", allowedRoots)
      ).toBe(false);
    });

    it("blocks path outside all roots", () => {
      expect(isPathSafe("/var/log/syslog", allowedRoots)).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("empty allowed roots blocks everything", () => {
      expect(isPathSafe("/tmp/workspace/file.txt", [])).toBe(false);
    });
  });
});
