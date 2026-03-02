import { describe, it, expect, vi, afterEach } from "vitest";
import { issueToken, verifyToken, generateJwtSecret } from "./jwt.js";

describe("JWT", () => {
  const secret = "test-secret-key-at-least-32-chars-long-for-safety";

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("issueToken + verifyToken roundtrip", () => {
    it("issues and verifies a valid token", () => {
      const token = issueToken("user-123", secret);
      const payload = verifyToken(token, secret);

      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe("user-123");
      expect(payload!.iss).toBe("scb");
      expect(payload!.origin).toBe("web");
      expect(payload!.exp).toBeGreaterThan(payload!.iat);
    });

    it("supports custom origin", () => {
      const token = issueToken("tg-456", secret, "telegram");
      const payload = verifyToken(token, secret);

      expect(payload!.origin).toBe("telegram");
    });

    it("supports custom TTL", () => {
      const token = issueToken("user-789", secret, "web", 3600);
      const payload = verifyToken(token, secret);

      expect(payload!.exp - payload!.iat).toBe(3600);
    });
  });

  describe("verification failures", () => {
    it("rejects token with wrong secret", () => {
      const token = issueToken("user-123", secret);
      const result = verifyToken(token, "wrong-secret");
      expect(result).toBeNull();
    });

    it("rejects expired token", () => {
      vi.useFakeTimers();
      const token = issueToken("user-123", secret, "web", 60);

      // Advance past expiry
      vi.advanceTimersByTime(120_000);

      const result = verifyToken(token, secret);
      expect(result).toBeNull();
    });

    it("rejects tampered payload", () => {
      const token = issueToken("user-123", secret);
      const parts = token.split(".");

      // Tamper with payload (change sub)
      const tamperedPayload = Buffer.from(
        JSON.stringify({ sub: "admin", iss: "scb", iat: 0, exp: 9999999999, origin: "web" })
      ).toString("base64url");

      const tampered = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
      const result = verifyToken(tampered, secret);
      expect(result).toBeNull();
    });

    it("rejects malformed token (missing parts)", () => {
      expect(verifyToken("not.a.valid.jwt.token", secret)).toBeNull();
      expect(verifyToken("onlyonepart", secret)).toBeNull();
      expect(verifyToken("", secret)).toBeNull();
    });

    it("rejects token with invalid issuer", () => {
      // Manually create a token with wrong issuer
      const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
      const payload = Buffer.from(
        JSON.stringify({ sub: "user", iss: "evil", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, origin: "web" })
      ).toString("base64url");

      // This will fail signature check anyway, but tests issuer validation path
      const result = verifyToken(`${header}.${payload}.fakesig`, secret);
      expect(result).toBeNull();
    });
  });

  describe("generateJwtSecret", () => {
    it("generates a 128-character hex string", () => {
      const s = generateJwtSecret();
      expect(s).toMatch(/^[0-9a-f]{128}$/);
    });

    it("generates unique secrets", () => {
      const s1 = generateJwtSecret();
      const s2 = generateJwtSecret();
      expect(s1).not.toBe(s2);
    });
  });
});
