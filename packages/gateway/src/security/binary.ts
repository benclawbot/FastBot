import { basename } from "node:path";
import { createChildLogger } from "../logger/index.js";

const log = createChildLogger("security:binary");

/**
 * Check if a binary/executable is on the allowlist.
 */
export function isBinaryAllowed(
  command: string,
  allowlist: string[]
): boolean {
  const name = basename(command);
  const allowed = allowlist.includes(name);

  if (!allowed) {
    log.warn({ command, name }, "Binary blocked: not on allowlist");
  }

  return allowed;
}
