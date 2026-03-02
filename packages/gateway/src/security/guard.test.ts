import { describe, it, expect, beforeEach, vi } from "vitest";
import { SecurityGuard } from "./guard.js";

// Minimal mocks for audit and rate limiter
function mockAudit() {
  return { log: vi.fn(), query: vi.fn(() => []) } as any;
}

function mockRateLimiter(allowAll = true) {
  return {
    consume: vi.fn(() => allowAll),
    remaining: vi.fn(() => (allowAll ? 10 : 0)),
    shutdown: vi.fn(),
  } as any;
}

describe("SecurityGuard", () => {
  let guard: SecurityGuard;
  let audit: ReturnType<typeof mockAudit>;
  let limiter: ReturnType<typeof mockRateLimiter>;

  beforeEach(() => {
    audit = mockAudit();
    limiter = mockRateLimiter();
    guard = new SecurityGuard({
      config: {
        shellAllowedPaths: ["/home/user", "/tmp"],
        binaryAllowlist: ["git", "node", "npm", "ls"],
        dashboardRateLimit: 60,
      } as any,
      audit,
      rateLimiter: limiter,
    });
  });

  describe("checkUrl", () => {
    it("allows public URLs", () => {
      expect(guard.checkUrl("https://example.com", "user1").allowed).toBe(true);
    });

    it("blocks internal URLs", () => {
      const result = guard.checkUrl("http://127.0.0.1/admin", "user1");
      expect(result.allowed).toBe(false);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ event: "security.ssrf_blocked" })
      );
    });

    it("blocks localhost", () => {
      expect(guard.checkUrl("http://localhost:8080", "user1").allowed).toBe(false);
    });
  });

  describe("checkPath", () => {
    it("allows paths within roots", () => {
      expect(guard.checkPath("/home/user/file.txt", "user1").allowed).toBe(true);
    });

    it("blocks paths outside roots", () => {
      const result = guard.checkPath("/etc/passwd", "user1");
      expect(result.allowed).toBe(false);
      expect(audit.log).toHaveBeenCalled();
    });
  });

  describe("checkBinary", () => {
    it("allows whitelisted binaries", () => {
      expect(guard.checkBinary("git", "user1").allowed).toBe(true);
      expect(guard.checkBinary("node", "user1").allowed).toBe(true);
    });

    it("blocks unauthorized binaries", () => {
      const result = guard.checkBinary("rm", "user1");
      expect(result.allowed).toBe(false);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ event: "security.binary_blocked" })
      );
    });
  });

  describe("checkRateLimit", () => {
    it("allows when under limit", () => {
      expect(guard.checkRateLimit("user1").allowed).toBe(true);
    });

    it("blocks when over limit", () => {
      limiter = mockRateLimiter(false);
      guard = new SecurityGuard({
        config: {
          shellAllowedPaths: [],
          binaryAllowlist: [],
          dashboardRateLimit: 60,
        } as any,
        audit,
        rateLimiter: limiter,
      });
      const result = guard.checkRateLimit("user1");
      expect(result.allowed).toBe(false);
    });
  });

  describe("checkShellCommand", () => {
    it("allows valid command with safe args", () => {
      const result = guard.checkShellCommand("git", ["status"], "user1");
      expect(result.allowed).toBe(true);
    });

    it("blocks unauthorized binary", () => {
      const result = guard.checkShellCommand("curl", ["http://example.com"], "user1");
      expect(result.allowed).toBe(false);
    });

    it("blocks path traversal in arguments", () => {
      const result = guard.checkShellCommand("ls", ["/etc/shadow"], "user1");
      expect(result.allowed).toBe(false);
    });

    it("ignores non-path arguments", () => {
      const result = guard.checkShellCommand("git", ["commit", "-m", "hello"], "user1");
      expect(result.allowed).toBe(true);
    });
  });

  describe("sanitizeInput", () => {
    it("removes null bytes", () => {
      expect(guard.sanitizeInput("hello\0world")).toBe("helloworld");
    });

    it("removes control characters but keeps newlines and tabs", () => {
      expect(guard.sanitizeInput("hello\x01\x02\nworld\there")).toBe(
        "hello\nworld\there"
      );
    });

    it("collapses excessive newlines", () => {
      expect(guard.sanitizeInput("a\n\n\n\n\n\nb")).toBe("a\n\n\nb");
    });

    it("trims whitespace", () => {
      expect(guard.sanitizeInput("  hello  ")).toBe("hello");
    });

    it("handles empty input", () => {
      expect(guard.sanitizeInput("")).toBe("");
    });
  });

  describe("validateChatMessage", () => {
    it("allows valid messages", () => {
      const result = guard.validateChatMessage("Hello, world!", "user1");
      expect(result.allowed).toBe(true);
      expect(result.sanitized).toBe("Hello, world!");
    });

    it("blocks empty messages", () => {
      const result = guard.validateChatMessage("   ", "user1");
      expect(result.allowed).toBe(false);
    });

    it("blocks oversized messages", () => {
      const long = "x".repeat(20000);
      const result = guard.validateChatMessage(long, "user1");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("too long");
    });

    it("sanitizes input before validation", () => {
      const result = guard.validateChatMessage("hello\0world", "user1");
      expect(result.allowed).toBe(true);
      expect(result.sanitized).toBe("helloworld");
    });

    it("blocks when rate limited", () => {
      limiter = mockRateLimiter(false);
      guard = new SecurityGuard({
        config: {
          shellAllowedPaths: [],
          binaryAllowlist: [],
          dashboardRateLimit: 60,
        } as any,
        audit,
        rateLimiter: limiter,
      });
      const result = guard.validateChatMessage("hello", "user1");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Rate limit");
    });
  });
});
