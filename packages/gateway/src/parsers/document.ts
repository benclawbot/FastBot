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
 * Preflight the XLSX ZIP directory before unpacking untrusted spreadsheets.
 * Reject ZIP64 and multi-disk archives rather than accepting unbounded sizes.
 * This is a resource check, not a substitute for an up-to-date ZIP parser.
 */
const MAX_XLSX_ARCHIVE_BYTES = 10 * 1024 * 1024;
const MAX_XLSX_UNPACKED_BYTES = 40 * 1024 * 1024;
const MAX_XLSX_ENTRY_BYTES = 16 * 1024 * 1024;
const MAX_XLSX_ENTRIES = 2_000;
const MAX_XLSX_CELLS = 500_000;
const MAX_XLSX_OUTPUT_CHARS = 4 * 1024 * 1024;

function assertSafeXlsxArchive(buffer: Buffer): void {
  if (buffer.length > MAX_XLSX_ARCHIVE_BYTES) {
    throw new Error("XLSX archive exceeds the 10 MiB input limit");
  }
  if (buffer.length < 22) {
    throw new Error("Invalid XLSX ZIP archive");
  }

  // The end-of-central-directory record may contain a 65,535-byte comment.
  const minimum = Math.max(0, buffer.length - 22 - 65_535);
  let end = -1;
  for (let i = buffer.length - 22; i >= minimum; i--) {
    if (
      buffer.readUInt32LE(i) === 0x06054b50 &&
      i + 22 + buffer.readUInt16LE(i + 20) === buffer.length
    ) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("Invalid XLSX ZIP directory");
  if (buffer.readUInt16LE(end + 4) !== 0 || buffer.readUInt16LE(end + 6) !== 0) {
    throw new Error("Multi-disk XLSX archives are not supported");
  }

  const entriesOnDisk = buffer.readUInt16LE(end + 8);
  const entries = buffer.readUInt16LE(end + 10);
  const directoryBytes = buffer.readUInt32LE(end + 12);
  const directoryOffset = buffer.readUInt32LE(end + 16);
  if (
    entries === 0 ||
    entries > MAX_XLSX_ENTRIES ||
    entriesOnDisk !== entries ||
    entries === 0xffff ||
    directoryBytes === 0xffffffff ||
    directoryOffset === 0xffffffff ||
    directoryOffset + directoryBytes > end
  ) {
    throw new Error("XLSX ZIP directory exceeds safety limits");
  }

  const directoryEnd = directoryOffset + directoryBytes;
  let cursor = directoryOffset;
  let totalUnpacked = 0;
  for (let i = 0; i < entries; i++) {
    if (cursor + 46 > directoryEnd || buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error("Invalid XLSX ZIP directory entry");
    }
    const flags = buffer.readUInt16LE(cursor + 8);
    const compression = buffer.readUInt16LE(cursor + 10);
    const compressedBytes = buffer.readUInt32LE(cursor + 20);
    const unpackedBytes = buffer.readUInt32LE(cursor + 24);
    const nameBytes = buffer.readUInt16LE(cursor + 28);
    const extraBytes = buffer.readUInt16LE(cursor + 30);
    const commentBytes = buffer.readUInt16LE(cursor + 32);
    const next = cursor + 46 + nameBytes + extraBytes + commentBytes;
    if (
      next > directoryEnd ||
      (flags & 1) !== 0 ||
      (compression !== 0 && compression !== 8) ||
      compressedBytes === 0xffffffff ||
      unpackedBytes === 0xffffffff ||
      unpackedBytes > MAX_XLSX_ENTRY_BYTES ||
      (unpackedBytes > 0 && compressedBytes === 0) ||
      unpackedBytes > compressedBytes * 250 + 1024
    ) {
      throw new Error("XLSX ZIP entry exceeds safety limits");
    }
    totalUnpacked += unpackedBytes;
    if (totalUnpacked > MAX_XLSX_UNPACKED_BYTES) {
      throw new Error("XLSX ZIP content exceeds the 40 MiB expansion limit");
    }
    cursor = next;
  }
  if (cursor !== directoryEnd) throw new Error("Invalid XLSX ZIP directory size");
}

function csvCell(value: unknown): string {
  if (value == null) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

/**
 * Extract text from XLSX using a maintained, read-only spreadsheet parser.
 * Keep the legacy sheet markers and CSV-oriented text presentation.
 */
async function extractFromXlsx(buffer: Buffer): Promise<string> {
  try {
    assertSafeXlsxArchive(buffer);
    const { default: readXlsxFile } = await import("read-excel-file/node");
    const sheets = await readXlsxFile(buffer);
    if (sheets.length > 100) throw new Error("XLSX contains too many worksheets");

    const textParts: string[] = [];
    let cells = 0;
    let outputChars = 0;
    for (const sheet of sheets) {
      const rows = sheet.data;
      const csvLines: string[] = [];
      for (const row of rows) {
        cells += row.length;
        if (cells > MAX_XLSX_CELLS) {
          throw new Error("XLSX contains too many cells");
        }
        const line = row.map(csvCell).join(",");
        outputChars += line.length + 1;
        if (outputChars > MAX_XLSX_OUTPUT_CHARS) {
          throw new Error("XLSX extracted text exceeds the 4 MiB limit");
        }
        csvLines.push(line);
      }
      const csv = csvLines.join("\n");
      if (csv.trim()) {
        textParts.push(`=== Sheet: ${sheet.sheet} ===`);
        textParts.push(csv);
      }
    }

    const text = textParts.join("\n").trim();
    log.info(
      { textLength: text.length, sheetCount: sheets.length },
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
