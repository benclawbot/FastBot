import pino from "pino";

const redactPaths = [
  "apiKey",
  "api_key",
  "secret",
  "token",
  "password",
  "authorization",
  "credential",
  "pin",
  "*.apiKey",
  "*.api_key",
  "*.secret",
  "*.token",
  "*.password",
  "*.authorization",
  "*.credential",
  "*.pin",
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: redactPaths,
    censor: "[REDACTED]",
  },
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});

export function createChildLogger(subsystem: string) {
  return logger.child({ subsystem });
}

/**
 * Mask a secret string, showing only the last 4 characters.
 * Returns "****" if the string is too short.
 */
export function maskSecret(value: string): string {
  if (value.length <= 4) return "****";
  return "****" + value.slice(-4);
}
