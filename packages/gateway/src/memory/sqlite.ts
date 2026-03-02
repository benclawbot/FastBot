import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createChildLogger } from "../logger/index.js";

const log = createChildLogger("sqlite");

/**
 * Thin wrapper around sql.js that provides file persistence.
 * sql.js is a pure JS/WASM SQLite — no native deps, works on Android Termux.
 */
export class SQLiteDB {
  private db: SqlJsDatabase | null = null;
  private dirty = false;
  private saveHandle: ReturnType<typeof setInterval> | null = null;

  constructor(private dbPath: string) {}

  async init(): Promise<void> {
    const SQL = await initSqlJs();

    if (existsSync(this.dbPath)) {
      const buffer = readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
      log.info({ path: this.dbPath }, "SQLite database loaded from file");
    } else {
      const dir = dirname(this.dbPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      this.db = new SQL.Database();
      log.info({ path: this.dbPath }, "New SQLite database created");
    }

    // Enable WAL-like optimization
    this.db.run("PRAGMA journal_mode = MEMORY");
    this.db.run("PRAGMA synchronous = NORMAL");

    // Auto-save every 5 seconds if dirty
    this.saveHandle = setInterval(() => {
      if (this.dirty) this.persist();
    }, 5_000);
  }

  /**
   * Execute a SQL statement (CREATE, INSERT, UPDATE, DELETE).
   */
  exec(sql: string): void {
    this.db!.run(sql);
    this.dirty = true;
  }

  /**
   * Run a parameterized statement. Returns { changes }.
   */
  run(sql: string, params: unknown[] = []): { changes: number } {
    this.db!.run(sql, params as any[]);
    this.dirty = true;
    return { changes: this.db!.getRowsModified() };
  }

  /**
   * Query rows. Returns array of row objects.
   */
  all<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): T[] {
    const stmt = this.db!.prepare(sql);
    if (params.length) stmt.bind(params as any[]);

    const rows: T[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return rows;
  }

  /**
   * Query a single row. Returns undefined if no match.
   */
  get<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): T | undefined {
    const rows = this.all<T>(sql, params);
    return rows[0];
  }

  /**
   * Write database to disk.
   */
  persist(): void {
    if (!this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    writeFileSync(this.dbPath, buffer);
    this.dirty = false;
  }

  /**
   * Close database and flush to disk.
   */
  close(): void {
    if (this.saveHandle) clearInterval(this.saveHandle);
    this.persist();
    this.db?.close();
    this.db = null;
    log.info("SQLite database closed");
  }
}
