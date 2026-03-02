import type { SQLiteDB } from "../memory/sqlite.js";
import { encrypt, decrypt } from "./cipher.js";
import { createChildLogger, maskSecret } from "../logger/index.js";

const log = createChildLogger("keystore");

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS keystore (
    name TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

/**
 * Encrypted key-value store backed by SQLite (sql.js — pure JS, no native deps).
 * All values are AES-256-GCM encrypted with a key derived from the user's PIN.
 */
export class KeyStore {
  constructor(
    private db: SQLiteDB,
    private pin: string
  ) {
    this.db.exec(CREATE_TABLE);
    log.info("Encrypted key store initialized");
  }

  set(name: string, value: string): void {
    const encrypted = encrypt(value, this.pin);
    const encoded = encrypted.toString("base64");
    this.db.run(
      `INSERT INTO keystore (name, value) VALUES (?, ?)
       ON CONFLICT(name) DO UPDATE SET value = ?, updated_at = datetime('now')`,
      [name, encoded, encoded]
    );
    log.info({ name, masked: maskSecret(value) }, "Key stored");
  }

  get(name: string): string | null {
    const row = this.db.get<{ value: string }>(
      "SELECT value FROM keystore WHERE name = ?",
      [name]
    );
    if (!row) return null;
    try {
      const packed = Buffer.from(row.value, "base64");
      return decrypt(packed, this.pin);
    } catch (err) {
      log.error({ name, err }, "Failed to decrypt key — wrong PIN?");
      return null;
    }
  }

  delete(name: string): boolean {
    const result = this.db.run("DELETE FROM keystore WHERE name = ?", [name]);
    return result.changes > 0;
  }

  list(): Array<{ name: string; created_at: string; updated_at: string }> {
    return this.db.all(
      "SELECT name, created_at, updated_at FROM keystore ORDER BY name"
    );
  }

  has(name: string): boolean {
    return this.db.get("SELECT 1 FROM keystore WHERE name = ?", [name]) !== undefined;
  }
}
