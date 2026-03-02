import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AuditLog, type AuditEvent } from "./audit.js";
import { SQLiteDB } from "../memory/sqlite.js";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";

const TEST_DB = "data/test-audit.db";

describe("AuditLog", () => {
  let db: SQLiteDB;
  let audit: AuditLog;

  beforeEach(async () => {
    mkdirSync("data", { recursive: true });
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    db = new SQLiteDB(TEST_DB);
    await db.init();
    audit = new AuditLog(db);
  });

  afterEach(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  it("logs an audit entry", () => {
    audit.log({ event: "auth.login", actor: "user-1" });
    const rows = audit.query({ limit: 10 });
    expect(rows).toHaveLength(1);
    expect((rows[0] as any).event).toBe("auth.login");
    expect((rows[0] as any).actor).toBe("user-1");
  });

  it("logs entry with detail and meta", () => {
    audit.log({
      event: "tool.executed",
      actor: "agent-main",
      detail: "Ran git status",
      meta: { command: "git", args: ["status"], duration: 120 },
    });
    const rows = audit.query();
    expect(rows).toHaveLength(1);
    const row = rows[0] as any;
    expect(row.detail).toBe("Ran git status");
    const meta = JSON.parse(row.meta);
    expect(meta.command).toBe("git");
    expect(meta.duration).toBe(120);
  });

  it("logs multiple entries in order", () => {
    audit.log({ event: "auth.login", actor: "user-1" });
    audit.log({ event: "tool.executed", actor: "user-1", detail: "ls" });
    audit.log({ event: "auth.login_failed", actor: "user-2" });

    const rows = audit.query({ limit: 10 });
    expect(rows).toHaveLength(3);
    // Most recent first (ORDER BY id DESC)
    expect((rows[0] as any).event).toBe("auth.login_failed");
    expect((rows[2] as any).event).toBe("auth.login");
  });

  it("filters by event type", () => {
    audit.log({ event: "auth.login", actor: "user-1" });
    audit.log({ event: "security.rate_limited", actor: "user-2" });
    audit.log({ event: "auth.login", actor: "user-3" });

    const logins = audit.query({ event: "auth.login" });
    expect(logins).toHaveLength(2);
    for (const r of logins) {
      expect((r as any).event).toBe("auth.login");
    }
  });

  it("respects limit", () => {
    for (let i = 0; i < 20; i++) {
      audit.log({ event: "tool.executed", actor: `user-${i}` });
    }
    const rows = audit.query({ limit: 5 });
    expect(rows).toHaveLength(5);
  });

  it("audit entries have timestamps", () => {
    audit.log({ event: "session.created", actor: "system" });
    const rows = audit.query();
    expect((rows[0] as any).timestamp).toBeTruthy();
  });

  it("audit log is append-only (no update/delete exposed)", () => {
    audit.log({ event: "auth.login", actor: "user-1" });
    // AuditLog class only exposes log() and query() — no delete/update methods
    expect(typeof (audit as any).delete).toBe("undefined");
    expect(typeof (audit as any).update).toBe("undefined");
  });

  it("handles all event types", () => {
    const events: AuditEvent[] = [
      "auth.login",
      "auth.login_failed",
      "auth.telegram_approved",
      "auth.telegram_rejected",
      "tool.executed",
      "tool.blocked",
      "security.ssrf_blocked",
      "security.path_traversal",
      "security.rate_limited",
      "security.binary_blocked",
      "agent.spawned",
      "agent.completed",
      "agent.failed",
      "session.created",
      "session.reaped",
    ];

    for (const event of events) {
      audit.log({ event, actor: "test" });
    }

    const rows = audit.query({ limit: 100 });
    expect(rows).toHaveLength(events.length);
  });
});
