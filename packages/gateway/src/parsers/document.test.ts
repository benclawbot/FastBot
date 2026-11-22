/**
 * Characterization tests for the current XLSX extraction contract.
 *
 * These protect observable behavior before replacing the vulnerable
 * SheetJS reader (see #34). Replace the in-test workbook generator with
 * dependency-independent fixtures as part of that migration.
 */
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { extractTextFromDocument, isDocumentSupported } from "./document.js";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function workbookBuffer(
  sheets: Array<{ name: string; rows: Array<Array<string | number>> }>
): Buffer {
  const workbook = XLSX.utils.book_new();
  for (const { name, rows } of sheets) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }) as Buffer;
}

describe("document parser XLSX contract", () => {
  it("preserves sheet order and CSV text while omitting empty sheets", async () => {
    const buffer = workbookBuffer([
      { name: "Overview", rows: [["Item", "Count"], ["café", 3], ["Tea", 0]] },
      { name: "Empty", rows: [] },
      { name: "Notes", rows: [["Message"], ["Hello"]] },
    ]);

    const text = await extractTextFromDocument(buffer, XLSX_MIME, "report.XLSX");

    expect(text).toBe(
      "=== Sheet: Overview ===\n" +
        "Item,Count\ncafé,3\nTea,0\n" +
        "=== Sheet: Notes ===\nMessage\nHello"
    );
    expect(text).not.toContain("=== Sheet: Empty ===");
  });

  it("quotes commas and embedded double quotes in cell text", async () => {
    const buffer = workbookBuffer([
      { name: "Quotes", rows: [["Message"], ['Hello, "world"']] },
    ]);

    const text = await extractTextFromDocument(buffer, XLSX_MIME, "quotes.xlsx");

    expect(text).toContain('"Hello, ""world"""');
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
