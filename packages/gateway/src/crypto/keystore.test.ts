import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { KeyStore } from "./keystore.js";
import { SQLiteDB } from "../memory/sqlite.js";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";

const TEST_DB = "data/test-keystore.db";

describe("KeyStore", () => {
  let db: SQLiteDB;
  let store: KeyStore;
  const pin = "test-pin-9876";

  beforeEach(async () => {
    mkdirSync("data", { recursive: true });
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    db = new SQLiteDB(TEST_DB);
    await db.init();
    store = new KeyStore(db, pin);
  });

  afterEach(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  it("stores and retrieves a key", () => {
    store.set("api_key", "sk-ant-secret123");
    expect(store.get("api_key")).toBe("sk-ant-secret123");
  });

  it("returns null for non-existent key", () => {
    expect(store.get("nonexistent")).toBeNull();
  });

  it("overwrites an existing key", () => {
    store.set("token", "old-value");
    store.set("token", "new-value");
    expect(store.get("token")).toBe("new-value");
  });

  it("deletes a key", () => {
    store.set("temp", "value");
    expect(store.delete("temp")).toBe(true);
    expect(store.get("temp")).toBeNull();
  });

  it("returns false when deleting non-existent key", () => {
    expect(store.delete("ghost")).toBe(false);
  });

  it("lists all stored keys (names only)", () => {
    store.set("key_a", "val1");
    store.set("key_b", "val2");
    store.set("key_c", "val3");

    const list = store.list();
    expect(list.map((r) => r.name)).toEqual(["key_a", "key_b", "key_c"]);
    // Ensure no values are leaked
    for (const item of list) {
      expect(item).not.toHaveProperty("value");
    }
  });

  it("has() returns true for existing key", () => {
    store.set("exists", "yes");
    expect(store.has("exists")).toBe(true);
    expect(store.has("nope")).toBe(false);
  });

  it("handles unicode values", () => {
    store.set("emoji", "🔐 secret clé");
    expect(store.get("emoji")).toBe("🔐 secret clé");
  });

  it("handles empty string value", () => {
    store.set("empty", "");
    expect(store.get("empty")).toBe("");
  });

  it("fails to decrypt with wrong PIN", () => {
    store.set("protected", "my-secret");
    // Create new store with wrong PIN
    const wrongStore = new KeyStore(db, "wrong-pin");
    expect(wrongStore.get("protected")).toBeNull();
  });

  it("survives persist/reload cycle", async () => {
    store.set("persist_test", "durable-value");
    db.persist();
    db.close();

    // Reopen
    const db2 = new SQLiteDB(TEST_DB);
    await db2.init();
    const store2 = new KeyStore(db2, pin);
    expect(store2.get("persist_test")).toBe("durable-value");
    db2.close();
  });
});
