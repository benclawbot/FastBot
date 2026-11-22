/**
 * XLSX reader regression tests. The OOXML fixture is encoded as base64 text
 * so it stays independent from both the old and the new XLSX libraries.
 */
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { extractTextFromDocument, isDocumentSupported } from "./document.js";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function workbookBuffer(): Promise<Buffer> {
  const base64 = await readFile(
    new URL("./__fixtures__/xlsx-contract.xlsx.base64", import.meta.url),
    "utf8"
  );
  return Buffer.from(base64.trim(), "base64");
}

describe("document parser XLSX contract", () => {
  it("preserves order, numeric cells, and Unicode while omitting empty sheets", async () => {
    const text = await extractTextFromDocument(
      await workbookBuffer(),
      XLSX_MIME,
      "report.XLSX"
    );
    expect(text).toBe(
      "=== Sheet: Overview ===\n" +
        "Item,Count\ncafé,3\nTea,0\n" +
        '=== Sheet: Notes ===\nMessage\n"Hello, ""world"""'
    );
    expect(text).not.toContain("=== Sheet: Ignored ===");
  });

  it("escapes commas and double quotes in CSV-formatted text", async () => {
    const text = await extractTextFromDocument(
      await workbookBuffer(),
      XLSX_MIME,
      "report.xlsx"
    );
    expect(text).toContain('"Hello, ""world"""');
  });

  it("rejects invalid ZIP data and oversized uploads before parsing", async () => {
    await expect(
      extractTextFromDocument(Buffer.from("not a ZIP archive"), XLSX_MIME, "bad.xlsx")
    ).rejects.toThrow("XLSX extraction failed: Invalid XLSX ZIP archive");

    await expect(
      extractTextFromDocument(
        Buffer.alloc(10 * 1024 * 1024 + 1),
        XLSX_MIME,
        "oversized.xlsx"
      )
    ).rejects.toThrow("10 MiB input limit");
  });

  it("rejects impossible ZIP expansion sizes before parsing", async () => {
    const malformed = Buffer.from(await workbookBuffer());
    const header = malformed.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    expect(header).toBeGreaterThan(0);
    malformed.writeUInt32LE(0xffffffff, header + 24);
    await expect(
      extractTextFromDocument(malformed, XLSX_MIME, "bomb.xlsx")
    ).rejects.toThrow("ZIP entry exceeds safety limits");
  });

  it("identifies supported XLSX MIME types case-insensitively", () => {
    expect(isDocumentSupported(XLSX_MIME)).toBe(true);
    expect(isDocumentSupported(XLSX_MIME.toUpperCase())).toBe(true);
  });

  it("rejects unsupported file extensions", async () => {
    await expect(
      extractTextFromDocument(Buffer.from("not an xlsx"), "text/plain", "notes.txt")
    ).rejects.toThrow("Unsupported document type: txt");
  });
});
