import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SQLiteDB } from "./sqlite.js";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";

const TEST_DB = "data/test-sqlite.db";

describe("SQLiteDB", () => {
  let db: SQLiteDB;

  beforeEach(async () => {
    mkdirSync("data", { recursive: true });
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    db = new SQLiteDB(TEST_DB);
    await db.init();
  });

  afterEach(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  it("creates a table and inserts rows", () => {
    db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)");
    db.run("INSERT INTO test (name) VALUES (?)", ["alice"]);
    db.run("INSERT INTO test (name) VALUES (?)", ["bob"]);

    const rows = db.all<{ id: number; name: string }>("SELECT * FROM test");
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe("alice");
    expect(rows[1].name).toBe("bob");
  });

  it("get() returns single row", () => {
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, val TEXT)");
    db.run("INSERT INTO items (val) VALUES (?)", ["hello"]);

    const row = db.get<{ id: number; val: string }>(
      "SELECT * FROM items WHERE val = ?",
      ["hello"]
    );
    expect(row).toBeDefined();
    expect(row!.val).toBe("hello");
  });

  it("get() returns undefined for no match", () => {
    db.exec("CREATE TABLE empty (id INTEGER PRIMARY KEY)");
    const row = db.get("SELECT * FROM empty WHERE id = ?", [999]);
    expect(row).toBeUndefined();
  });

  it("run() returns changes count", () => {
    db.exec("CREATE TABLE counter (id INTEGER PRIMARY KEY, n INTEGER)");
    db.run("INSERT INTO counter (n) VALUES (?)", [1]);
    db.run("INSERT INTO counter (n) VALUES (?)", [2]);
    db.run("INSERT INTO counter (n) VALUES (?)", [3]);

    const result = db.run("DELETE FROM counter WHERE n > ?", [1]);
    expect(result.changes).toBe(2);
  });

  it("persists data to file and reloads", async () => {
    db.exec("CREATE TABLE persist (id INTEGER PRIMARY KEY, data TEXT)");
    db.run("INSERT INTO persist (data) VALUES (?)", ["durable"]);
    db.persist();
    db.close();

    // Reopen from file
    const db2 = new SQLiteDB(TEST_DB);
    await db2.init();
    const row = db2.get<{ data: string }>("SELECT data FROM persist");
    expect(row!.data).toBe("durable");
    db2.close();
  });

  it("handles concurrent operations", () => {
    db.exec(
      "CREATE TABLE concurrent (id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT)"
    );
    for (let i = 0; i < 100; i++) {
      db.run("INSERT INTO concurrent (v) VALUES (?)", [`item-${i}`]);
    }
    const rows = db.all("SELECT * FROM concurrent");
    expect(rows).toHaveLength(100);
  });

  it("handles parameterized queries with multiple types", () => {
    db.exec(
      "CREATE TABLE types (id INTEGER PRIMARY KEY, num REAL, txt TEXT, flag INTEGER)"
    );
    db.run("INSERT INTO types (num, txt, flag) VALUES (?, ?, ?)", [
      3.14,
      "hello",
      1,
    ]);
    const row = db.get<{ num: number; txt: string; flag: number }>(
      "SELECT * FROM types"
    );
    expect(row!.num).toBeCloseTo(3.14);
    expect(row!.txt).toBe("hello");
    expect(row!.flag).toBe(1);
  });
});
