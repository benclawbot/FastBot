import { TELEGRAM_MAX_LENGTH } from "../config/defaults.js";

/**
 * Split a long message into chunks that fit within Telegram's 4096 char limit.
 * Tries to break at paragraph boundaries, then sentence boundaries, then word boundaries.
 */
export function chunkMessage(
  text: string,
  maxLength: number = TELEGRAM_MAX_LENGTH
): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let splitAt = -1;

    // Try paragraph break
    const paraIdx = remaining.lastIndexOf("\n\n", maxLength);
    if (paraIdx > maxLength * 0.3) {
      splitAt = paraIdx;
    }

    // Try single newline
    if (splitAt === -1) {
      const nlIdx = remaining.lastIndexOf("\n", maxLength);
      if (nlIdx > maxLength * 0.3) {
        splitAt = nlIdx;
      }
    }

    // Try sentence boundary (. ! ?)
    if (splitAt === -1) {
      for (let i = maxLength; i > maxLength * 0.3; i--) {
        const ch = remaining[i];
        if ((ch === "." || ch === "!" || ch === "?") && remaining[i + 1] === " ") {
          splitAt = i + 1;
          break;
        }
      }
    }

    // Try space
    if (splitAt === -1) {
      const spaceIdx = remaining.lastIndexOf(" ", maxLength);
      if (spaceIdx > maxLength * 0.3) {
        splitAt = spaceIdx;
      }
    }

    // Hard cut as last resort
    if (splitAt === -1) {
      splitAt = maxLength;
    }

    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}
