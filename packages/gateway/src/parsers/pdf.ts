/**
 * PDF Parser - Extract text from PDF files using pdf-parse
 */
import { createChildLogger } from "../logger/index.js";
import { createRequire } from "node:module";

const log = createChildLogger("pdf-parser");

/**
 * Extract text from a PDF buffer using pdf-parse
 */
export async function extractTextFromPdf(pdfBuffer: Buffer): Promise<string> {
  try {
    // Use require for pdf-parse as it may not have proper ESM types
    const require = createRequire(import.meta.url);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require("pdf-parse");

    const result = await pdfParse(pdfBuffer);
    const text = result?.text?.trim() || "";

    log.info(
      { textLength: text.length },
      "PDF text extraction completed"
    );

    return text;
  } catch (err) {
    log.error({ err }, "PDF text extraction failed");
    // Return empty string instead of throwing to not break the flow
    return "";
  }
}

/**
 * Check if a MIME type is a supported PDF type
 */
export function isPdfSupported(mimeType: string): boolean {
  return mimeType.toLowerCase() === "application/pdf";
}
