import { resolve, normalize } from "node:path";
import { createChildLogger } from "../logger/index.js";

const log = createChildLogger("security:path");

/**
 * Check if a given file path is within one of the allowed root directories.
 * Prevents path traversal attacks (e.g., ../../etc/passwd).
 */
export function isPathSafe(
  filePath: string,
  allowedRoots: string[]
): boolean {
  const canonical = resolve(normalize(filePath));

  for (const root of allowedRoots) {
    const canonicalRoot = resolve(normalize(root));
    if (
      canonical === canonicalRoot ||
      canonical.startsWith(canonicalRoot + "/") ||
      canonical.startsWith(canonicalRoot + "\\")
    ) {
      return true;
    }
  }

  log.warn(
    { path: filePath, canonical, allowedRoots },
    "Path traversal: blocked path outside allowed roots"
  );
  return false;
}
