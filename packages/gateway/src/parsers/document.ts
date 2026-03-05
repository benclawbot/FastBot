/**
 * Document Parser - Extract text from Word, Excel, and PowerPoint files
 * Supports: .docx, .xlsx, .pptx
 */
import { createChildLogger } from "../logger/index.js";

const log = createChildLogger("doc-parser");

/**
 * Extract text from a document buffer based on file type
 */
export async function extractTextFromDocument(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<string> {
  const ext = filename.toLowerCase().split(".").pop();

  switch (ext) {
    case "docx":
      return extractFromDocx(buffer);
    case "xlsx":
      return extractFromXlsx(buffer);
    case "pptx":
      return extractFromPptx(buffer);
    default:
      throw new Error(`Unsupported document type: ${ext}`);
  }
}

/**
 * Extract text from DOCX using mammoth
 */
async function extractFromDocx(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });

    const text = result.value.trim();
    log.info({ textLength: text.length }, "DOCX text extraction completed");
    return text;
  } catch (err) {
    log.error({ err }, "DOCX extraction failed");
    throw new Error(
      `DOCX extraction failed: ${err instanceof Error ? err.message : "Unknown error"}`
    );
  }
}

/**
 * Extract text from XLSX using xlsx
 */
async function extractFromXlsx(buffer: Buffer): Promise<string> {
  try {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer" });

    const textParts: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      if (csv.trim()) {
        textParts.push(`=== Sheet: ${sheetName} ===`);
        textParts.push(csv);
      }
    }

    const text = textParts.join("\n").trim();
    log.info(
      { textLength: text.length, sheetCount: workbook.SheetNames.length },
      "XLSX text extraction completed"
    );
    return text;
  } catch (err) {
    log.error({ err }, "XLSX extraction failed");
    throw new Error(
      `XLSX extraction failed: ${err instanceof Error ? err.message : "Unknown error"}`
    );
  }
}

/**
 * Extract text from PPTX using mammoth (raw text extraction)
 */
async function extractFromPptx(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });

    const text = result.value.trim();
    log.info({ textLength: text.length }, "PPTX text extraction completed");
    return text;
  } catch (err) {
    log.error({ err }, "PPTX extraction failed");
    throw new Error(
      `PPTX extraction failed: ${err instanceof Error ? err.message : "Unknown error"}`
    );
  }
}

/**
 * Check if a MIME type is a supported document type
 */
export function isDocumentSupported(mimeType: string): boolean {
  const supportedTypes = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
    "application/vnd.openxmlformats-officedocument.presentationml.presentation", // pptx
    "application/msword", // older doc
  ];
  return supportedTypes.includes(mimeType.toLowerCase());
}
