import { createChildLogger } from "../logger/index.js";

const log = createChildLogger("security:ssrf");

/**
 * Blocked IP ranges for SSRF prevention.
 * Blocks all private, loopback, and link-local addresses.
 */
const BLOCKED_RANGES = [
  /^127\./,                   // Loopback
  /^10\./,                    // Class A private
  /^172\.(1[6-9]|2\d|3[01])\./, // Class B private
  /^192\.168\./,              // Class C private
  /^169\.254\./,              // Link-local
  /^0\./,                     // Current network
  /^::1$/,                    // IPv6 loopback (compressed)
  /^0:0:0:0:0:0:0:1$/,        // IPv6 loopback (full form)
  /^::$/,                     // IPv6 unspecified (all zeros)
  /^::ffff:/,                 // IPv4-mapped IPv6 address
  /^fc00:/i,                  // IPv6 unique local
  /^fe80:/i,                  // IPv6 link-local
  /^224\./,                   // IPv6 multicast (224.0.0.0/4)
  /^240\./,                   // IPv4 reserved (240.0.0.0/4)
  /^255\.255\.255\.255$/,     // IPv4 broadcast
  /^localhost$/i,
];

/**
 * Check if a URL targets a blocked internal address.
 * Returns true if the URL is safe, false if it should be blocked.
 */
export function isUrlSafe(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname;

    for (const pattern of BLOCKED_RANGES) {
      if (pattern.test(hostname)) {
        log.warn({ url: urlString, hostname }, "SSRF: blocked internal URL");
        return false;
      }
    }

    return true;
  } catch {
    log.warn({ url: urlString }, "SSRF: invalid URL blocked");
    return false;
  }
}
