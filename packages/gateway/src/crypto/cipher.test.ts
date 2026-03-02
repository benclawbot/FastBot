import { describe, it, expect } from "vitest";
import { encrypt, decrypt, deriveKey, generateSalt } from "./cipher.js";

describe("cipher", () => {
  const pin = "test-pin-1234";

  describe("deriveKey", () => {
    it("produces a 32-byte key", () => {
      const salt = generateSalt();
      const key = deriveKey(pin, salt);
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it("same pin + salt = same key", () => {
      const salt = generateSalt();
      const k1 = deriveKey(pin, salt);
      const k2 = deriveKey(pin, salt);
      expect(k1.equals(k2)).toBe(true);
    });

    it("different salt = different key", () => {
      const s1 = generateSalt();
      const s2 = generateSalt();
      const k1 = deriveKey(pin, s1);
      const k2 = deriveKey(pin, s2);
      expect(k1.equals(k2)).toBe(false);
    });

    it("different pin = different key", () => {
      const salt = generateSalt();
      const k1 = deriveKey("pin-a", salt);
      const k2 = deriveKey("pin-b", salt);
      expect(k1.equals(k2)).toBe(false);
    });
  });

  describe("generateSalt", () => {
    it("produces a 32-byte salt", () => {
      const salt = generateSalt();
      expect(salt).toBeInstanceOf(Buffer);
      expect(salt.length).toBe(32);
    });

    it("produces unique salts", () => {
      const s1 = generateSalt();
      const s2 = generateSalt();
      expect(s1.equals(s2)).toBe(false);
    });
  });

  describe("encrypt / decrypt roundtrip", () => {
    it("encrypts and decrypts a short string", () => {
      const plaintext = "sk-ant-api03-secret-key";
      const packed = encrypt(plaintext, pin);
      expect(packed).toBeInstanceOf(Buffer);
      // salt(32) + iv(12) + tag(16) + ciphertext
      expect(packed.length).toBeGreaterThan(60);

      const decrypted = decrypt(packed, pin);
      expect(decrypted).toBe(plaintext);
    });

    it("encrypts and decrypts a long string", () => {
      const plaintext = "A".repeat(10_000);
      const packed = encrypt(plaintext, pin);
      const decrypted = decrypt(packed, pin);
      expect(decrypted).toBe(plaintext);
    });

    it("encrypts and decrypts unicode", () => {
      const plaintext = "clé secrète 🔐 密钥";
      const packed = encrypt(plaintext, pin);
      const decrypted = decrypt(packed, pin);
      expect(decrypted).toBe(plaintext);
    });

    it("encrypts and decrypts empty string", () => {
      const packed = encrypt("", pin);
      const decrypted = decrypt(packed, pin);
      expect(decrypted).toBe("");
    });

    it("produces different ciphertext each time (random IV)", () => {
      const plaintext = "same-text";
      const p1 = encrypt(plaintext, pin);
      const p2 = encrypt(plaintext, pin);
      expect(p1.equals(p2)).toBe(false);
      // But both decrypt to same value
      expect(decrypt(p1, pin)).toBe(plaintext);
      expect(decrypt(p2, pin)).toBe(plaintext);
    });
  });

  describe("wrong PIN", () => {
    it("fails to decrypt with wrong PIN", () => {
      const packed = encrypt("secret", pin);
      expect(() => decrypt(packed, "wrong-pin")).toThrow();
    });
  });

  describe("tamper detection", () => {
    it("fails if ciphertext is modified", () => {
      const packed = encrypt("secret", pin);
      // Flip a byte in the ciphertext region
      packed[packed.length - 1] ^= 0xff;
      expect(() => decrypt(packed, pin)).toThrow();
    });

    it("fails if auth tag is modified", () => {
      const packed = encrypt("secret", pin);
      // Flip a byte in the auth tag region (offset 32+12 = 44)
      packed[44] ^= 0xff;
      expect(() => decrypt(packed, pin)).toThrow();
    });
  });
});
