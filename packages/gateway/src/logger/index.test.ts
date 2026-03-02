import { describe, it, expect } from "vitest";
import { maskSecret, createChildLogger } from "./index.js";

describe("logger utilities", () => {
  describe("maskSecret", () => {
    it("masks showing last 4 chars", () => {
      expect(maskSecret("sk-ant-api03-secret-key")).toBe("****-key");
    });

    it("masks a short key", () => {
      expect(maskSecret("abcde")).toBe("****bcde");
    });

    it("returns **** for 4-char or shorter strings", () => {
      expect(maskSecret("abcd")).toBe("****");
      expect(maskSecret("ab")).toBe("****");
      expect(maskSecret("")).toBe("****");
    });
  });

  describe("createChildLogger", () => {
    it("creates a logger with subsystem field", () => {
      const child = createChildLogger("test-subsystem");
      expect(child).toBeDefined();
      // pino child loggers have bindings
      expect((child as any).bindings().subsystem).toBe("test-subsystem");
    });
  });
});
