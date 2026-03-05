/**
 * PDF Parser - Extract text from PDF files using pdf-parse
 */
import { createChildLogger } from "../logger/index.js";
import type { PDFParse } from "pdf-parse";

const log = createChildLogger("pdf-parser");

/**
 * Extract text from a PDF buffer using pdf-parse
 */
export async function extractTextFromPdf(pdfBuffer: Buffer): Promise<string> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse(pdfBuffer);
    const data = await parser.parse();

    const text = data.text.trim();

    log.info(
      { textLength: text.length, pageCount: data.numpages },
      "PDF text extraction completed"
    );

    return text;
  } catch (err) {
    log.error({ err }, "PDF text extraction failed");
    throw new Error(
      `PDF extraction failed: ${err instanceof Error ? err.message : "Unknown error"}`
    );
  }
}

/**
 * Check if a MIME type is a supported PDF type
 */
export function isPdfSupported(mimeType: string): boolean {
  return mimeType.toLowerCase() === "application/pdf";
}
