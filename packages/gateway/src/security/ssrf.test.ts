import { describe, it, expect } from "vitest";
import { isUrlSafe } from "./ssrf.js";

describe("SSRF policy", () => {
  describe("blocks internal/private IPs", () => {
    const blocked = [
      "http://127.0.0.1/admin",
      "http://127.0.0.1:8080",
      "http://127.0.0.42/secret",
      "http://10.0.0.1/internal",
      "http://10.255.255.255/data",
      "http://172.16.0.1/api",
      "http://172.31.255.255/api",
      "http://192.168.0.1/router",
      "http://192.168.1.100/config",
      "http://169.254.169.254/latest/meta-data/", // AWS metadata
      "http://0.0.0.0/",
      "http://localhost/secret",
      "http://localhost:3000/api",
      "http://LOCALHOST/PATH",
    ];

    for (const url of blocked) {
      it(`blocks ${url}`, () => {
        expect(isUrlSafe(url)).toBe(false);
      });
    }
  });

  describe("allows public IPs", () => {
    const allowed = [
      "https://example.com",
      "https://api.anthropic.com/v1/messages",
      "https://8.8.8.8/dns",
      "https://1.1.1.1",
      "https://github.com/openclaw",
      "https://93.184.216.34",
    ];

    for (const url of allowed) {
      it(`allows ${url}`, () => {
        expect(isUrlSafe(url)).toBe(true);
      });
    }
  });

  describe("handles edge cases", () => {
    it("blocks invalid URLs", () => {
      expect(isUrlSafe("not-a-url")).toBe(false);
    });

    it("blocks empty string", () => {
      expect(isUrlSafe("")).toBe(false);
    });
  });
});
