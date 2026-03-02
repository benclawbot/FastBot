import { describe, it, expect } from "vitest";
import { chunkMessage } from "./chunker.js";

describe("chunkMessage", () => {
  it("returns single chunk for short messages", () => {
    expect(chunkMessage("Hello world")).toEqual(["Hello world"]);
  });

  it("returns single chunk for exactly max length", () => {
    const msg = "A".repeat(4096);
    expect(chunkMessage(msg)).toEqual([msg]);
  });

  it("splits at paragraph boundary", () => {
    const para1 = "A".repeat(2000);
    const para2 = "B".repeat(2000);
    const para3 = "C".repeat(2000);
    const text = `${para1}\n\n${para2}\n\n${para3}`;

    const chunks = chunkMessage(text, 4096);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // All content should be preserved
    expect(chunks.join(" ").replace(/\s+/g, "")).toBe(
      text.replace(/\s+/g, "")
    );
  });

  it("splits at newline when no paragraph break", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `Line ${i}: ${"X".repeat(50)}`);
    const text = lines.join("\n");

    const chunks = chunkMessage(text, 4096);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(4096);
    }
  });

  it("splits at sentence boundary", () => {
    const sentences = Array.from(
      { length: 50 },
      (_, i) => `This is sentence number ${i}. `
    );
    const text = sentences.join("");

    const chunks = chunkMessage(text, 200);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(200);
    }
  });

  it("splits at word boundary as fallback", () => {
    const words = Array.from({ length: 200 }, () => "word").join(" ");

    const chunks = chunkMessage(words, 100);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(100);
    }
  });

  it("hard cuts when no boundaries found", () => {
    const noSpaces = "X".repeat(10_000);

    const chunks = chunkMessage(noSpaces, 4096);
    expect(chunks.length).toBe(3); // ceil(10000 / 4096)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(4096);
    }
    expect(chunks.join("")).toBe(noSpaces);
  });

  it("handles empty string", () => {
    expect(chunkMessage("")).toEqual([""]);
  });

  it("preserves full content across chunks", () => {
    const text = Array.from({ length: 500 }, (_, i) => `Word${i}`).join(" ");
    const chunks = chunkMessage(text, 500);
    const reassembled = chunks.join(" ");
    // All words should appear
    expect(reassembled).toContain("Word0");
    expect(reassembled).toContain("Word499");
  });

  it("uses custom max length", () => {
    const text = "A".repeat(200);
    const chunks = chunkMessage(text, 50);
    expect(chunks.length).toBe(4);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(50);
    }
  });
});
