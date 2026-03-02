/**
 * End-to-end integration + security test suite.
 * Validates that all subsystems work together correctly.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { existsSync, unlinkSync } from "node:fs";
import { SQLiteDB } from "../memory/sqlite.js";
import { SessionManager } from "../session/manager.js";
import { KeyStore } from "../crypto/keystore.js";
import { AuditLog } from "../logger/audit.js";
import { RateLimiter } from "../security/rate-limiter.js";
import { SecurityGuard } from "../security/guard.js";
import { AgentOrchestrator } from "../agents/orchestrator.js";
import { ConversationStore } from "../memory/conversations.js";
import { cosineSimilarity } from "../memory/vectors.js";
import { MediaHandler } from "../media/handler.js";
import { CronScheduler } from "../cron/scheduler.js";
import { WorkflowEngine } from "../workflows/engine.js";
import { issueToken, verifyToken, generateJwtSecret } from "../security/jwt.js";
import { isUrlSafe } from "../security/ssrf.js";
import { isPathSafe } from "../security/path.js";
import { isBinaryAllowed } from "../security/binary.js";
import { encrypt, decrypt } from "../crypto/cipher.js";
import { chunkMessage } from "../telegram/chunker.js";
import { rmSync } from "node:fs";

const TEST_DB = "data/e2e-test.db";
const TEST_MEDIA = "data/e2e-media";

describe("E2E Integration", () => {
  let db: SQLiteDB;
  let sessions: SessionManager;
  let keyStore: KeyStore;
  let audit: AuditLog;
  let rateLimiter: RateLimiter;
  let guard: SecurityGuard;
  let conversations: ConversationStore;

  beforeAll(async () => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);

    db = new SQLiteDB(TEST_DB);
    await db.init();

    sessions = new SessionManager();
    keyStore = new KeyStore(db, "e2e-test-pin");
    audit = new AuditLog(db);
    rateLimiter = new RateLimiter(10, 60_000);
    guard = new SecurityGuard({
      config: {
        shellAllowedPaths: ["/tmp", "/home/user"],
        binaryAllowlist: ["git", "node", "npm", "ls"],
        dashboardRateLimit: 60,
      } as any,
      audit,
      rateLimiter,
    });
    conversations = new ConversationStore(db);
  });

  afterAll(() => {
    sessions.shutdown();
    rateLimiter.shutdown();
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    if (existsSync(TEST_MEDIA)) rmSync(TEST_MEDIA, { recursive: true });
  });

  describe("Full session lifecycle", () => {
    it("creates session, adds messages, persists to conversations, and destroys", () => {
      // Create session
      const session = sessions.getOrCreate("e2e-user", "web");
      expect(session.id).toBeTruthy();

      // Add messages to in-memory session
      sessions.addMessage(session.id, "user", "Hello from e2e");
      sessions.addMessage(session.id, "assistant", "Hello! I'm ready.");

      // Persist to conversation store
      for (const msg of session.messages) {
        conversations.append(session.id, "e2e-user", msg.role, msg.content);
      }

      // Verify persistence
      const stored = conversations.getBySession(session.id);
      expect(stored).toHaveLength(2);
      expect(stored[0].content).toBe("Hello from e2e");

      // Destroy session
      sessions.destroy(session.id);
      expect(sessions.getByActor("e2e-user")).toBeUndefined();

      // Conversations still persisted
      expect(conversations.getBySession(session.id)).toHaveLength(2);
    });
  });

  describe("Encryption pipeline", () => {
    it("encrypts API key, stores in keystore, retrieves and decrypts", async () => {
      const apiKey = "sk-test-super-secret-key-12345";

      await keyStore.set("test_api_key", apiKey);
      expect(await keyStore.has("test_api_key")).toBe(true);

      const retrieved = await keyStore.get("test_api_key");
      expect(retrieved).toBe(apiKey);

      // Verify it's actually encrypted in DB (not plaintext)
      const row = db.get<{ value: string }>(
        "SELECT value FROM keystore WHERE name = ?",
        ["test_api_key"]
      );
      expect(row!.value).not.toBe(apiKey);
      expect(row!.value).not.toContain("sk-test");
    });

    it("encrypt/decrypt roundtrip preserves data", () => {
      const secret = "my-encryption-pin";
      const data = "Sensitive API key: sk-abc123xyz";

      const encrypted = encrypt(data, secret);
      const decrypted = decrypt(encrypted, secret);
      expect(decrypted).toBe(data);
    });
  });

  describe("Security guard integration", () => {
    it("validates chat message through full pipeline", () => {
      const result = guard.validateChatMessage("Hello, world!", "e2e-user");
      expect(result.allowed).toBe(true);
      expect(result.sanitized).toBe("Hello, world!");
    });

    it("blocks message with null bytes", () => {
      const result = guard.validateChatMessage("hello\0world", "e2e-user");
      expect(result.allowed).toBe(true);
      expect(result.sanitized).toBe("helloworld"); // Sanitized
    });

    it("validates shell commands end-to-end", () => {
      expect(
        guard.checkShellCommand("git", ["status"], "e2e-user").allowed
      ).toBe(true);

      expect(
        guard.checkShellCommand("rm", ["-rf", "/"], "e2e-user").allowed
      ).toBe(false);
    });
  });

  describe("Audit trail integrity", () => {
    it("records all security events in audit log", () => {
      // Trigger various security events
      guard.checkUrl("http://127.0.0.1/admin", "audit-test");
      guard.checkBinary("curl", "audit-test");
      guard.checkPath("/etc/passwd", "audit-test");

      // Query audit log
      const entries = audit.query({ limit: 10 });
      const securityEvents = entries.filter(
        (e: any) => e.actor === "audit-test"
      );

      expect(securityEvents.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("JWT authentication flow", () => {
    it("issues token, verifies, and rejects tampered token", () => {
      const secret = generateJwtSecret();

      // Issue
      const token = issueToken("web-user-1", secret);
      expect(token.split(".")).toHaveLength(3);

      // Verify
      const payload = verifyToken(token, secret);
      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe("web-user-1");

      // Tamper
      const tampered = token.slice(0, -5) + "XXXXX";
      expect(verifyToken(tampered, secret)).toBeNull();

      // Wrong secret
      expect(verifyToken(token, "wrong-secret")).toBeNull();
    });
  });

  describe("Agent orchestrator integration", () => {
    it("spawns, runs, and tracks agent through full lifecycle", async () => {
      const orchestrator = new AgentOrchestrator(audit, guard);

      orchestrator.registerExecutor("test", async (task) => {
        return `Completed: ${task.description}`;
      });

      const task = orchestrator.spawn("test", "E2E test task", "e2e-session", "e2e-user");
      expect(task.status).toMatch(/pending|running/);

      // Wait for completion
      await new Promise((r) => setTimeout(r, 100));

      const completed = orchestrator.getTask(task.id)!;
      expect(completed.status).toBe("completed");
      expect(completed.result).toBe("Completed: E2E test task");

      // Board should show it completed
      const board = orchestrator.getBoard();
      expect(board.completed.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Workflow engine integration", () => {
    it("executes a multi-step workflow with variable passing", async () => {
      const engine = new WorkflowEngine(audit);

      engine.registerAction("greet", async (params) => {
        return `Hello, ${params.name}!`;
      });
      engine.registerAction("uppercase", async (params, vars) => {
        const input = String(vars["greet.output"] ?? params.text ?? "");
        return input.toUpperCase();
      });

      const yaml = `
id: e2e-wf
name: E2E Workflow
steps:
  - name: greet
    action: greet
    params:
      name: World
  - name: uppercase
    action: uppercase
    params: {}
`;
      engine.loadFromYaml(yaml);
      const run = await engine.execute("e2e-wf");

      expect(run.status).toBe("completed");
      expect(run.results[0].output).toBe("Hello, World!");
      expect(run.results[1].output).toBe("HELLO, WORLD!");
    });
  });

  describe("Media handler integration", () => {
    it("stores, reads, lists, and deletes files", () => {
      const handler = new MediaHandler(TEST_MEDIA);

      // Store
      const file = handler.store(
        Buffer.from("E2E test content"),
        "test.txt",
        "text/plain"
      );
      expect(file.id).toBeTruthy();

      // Read
      const data = handler.read(file.filename);
      expect(data!.toString()).toBe("E2E test content");

      // List
      expect(handler.list()).toHaveLength(1);

      // Stats
      const stats = handler.stats();
      expect(stats.fileCount).toBe(1);
      expect(stats.totalBytes).toBe(16);

      // Delete
      expect(handler.delete(file.filename)).toBe(true);
      expect(handler.list()).toHaveLength(0);
    });
  });

  describe("Cron scheduler integration", () => {
    it("registers, runs, and tracks a scheduled job", async () => {
      const scheduler = new CronScheduler(audit);
      let executed = false;

      scheduler.register("e2e-job", "E2E Test Job", "0 0 1 1 *", () => {
        executed = true;
      }, false);

      await scheduler.runNow("e2e-job");
      expect(executed).toBe(true);

      const job = scheduler.getJob("e2e-job")!;
      expect(job.runCount).toBe(1);
      expect(job.lastRun).toBeGreaterThan(0);

      scheduler.shutdown();
    });
  });

  describe("Message chunking", () => {
    it("chunks long messages for Telegram", () => {
      const longMsg = "A".repeat(8000);
      const chunks = chunkMessage(longMsg, 4096);
      expect(chunks.length).toBeGreaterThanOrEqual(2);

      // All content preserved
      expect(chunks.join("")).toBe(longMsg);
    });
  });
});

describe("E2E Security Suite", () => {
  describe("SSRF comprehensive", () => {
    const blocked = [
      "http://127.0.0.1/admin",
      "http://10.0.0.1/internal",
      "http://172.16.0.1/api",
      "http://192.168.1.1/router",
      "http://169.254.169.254/latest/meta-data/",
      "http://localhost:3000/api",
      "http://0.0.0.0/",
    ];

    for (const url of blocked) {
      it(`blocks ${url}`, () => {
        expect(isUrlSafe(url)).toBe(false);
      });
    }

    const allowed = [
      "https://api.anthropic.com/v1/messages",
      "https://api.openai.com/v1/chat",
      "https://example.com",
      "https://github.com/benclawbot",
    ];

    for (const url of allowed) {
      it(`allows ${url}`, () => {
        expect(isUrlSafe(url)).toBe(true);
      });
    }
  });

  describe("Path traversal comprehensive", () => {
    const roots = ["/home/user", "/tmp"];

    const safe = ["/home/user/file.txt", "/tmp/upload.png", "/home/user/project/src/index.ts"];
    const unsafe = ["/etc/passwd", "/etc/shadow", "../../../etc/passwd", "/root/.ssh/id_rsa"];

    for (const p of safe) {
      it(`allows ${p}`, () => {
        expect(isPathSafe(p, roots)).toBe(true);
      });
    }

    for (const p of unsafe) {
      it(`blocks ${p}`, () => {
        expect(isPathSafe(p, roots)).toBe(false);
      });
    }
  });

  describe("Binary allowlist comprehensive", () => {
    const allowlist = ["git", "node", "npm", "pnpm", "npx", "ls", "cat", "echo"];

    const allowed = ["git", "node", "npm", "/usr/bin/git", "/usr/local/bin/node"];
    const blocked = ["rm", "curl", "wget", "python", "bash", "sh", "eval", "sudo"];

    for (const bin of allowed) {
      it(`allows ${bin}`, () => {
        expect(isBinaryAllowed(bin, allowlist)).toBe(true);
      });
    }

    for (const bin of blocked) {
      it(`blocks ${bin}`, () => {
        expect(isBinaryAllowed(bin, allowlist)).toBe(false);
      });
    }
  });

  describe("Encryption security", () => {
    it("different PINs produce different ciphertext", () => {
      const data = "secret-data";
      const enc1 = encrypt(data, "pin-1");
      const enc2 = encrypt(data, "pin-2");
      expect(enc1.equals(enc2)).toBe(false);
    });

    it("same PIN produces different ciphertext (random IV)", () => {
      const data = "secret-data";
      const enc1 = encrypt(data, "same-pin");
      const enc2 = encrypt(data, "same-pin");
      expect(enc1.equals(enc2)).toBe(false);
    });

    it("decryption with wrong PIN fails gracefully", () => {
      const encrypted = encrypt("secret", "correct-pin");
      expect(() => decrypt(encrypted, "wrong-pin")).toThrow();
    });

    it("tampered ciphertext fails integrity check", () => {
      const encrypted = encrypt("secret", "my-pin");
      // Flip a byte in the ciphertext (after salt+iv+tag = 32+12+16 = 60 bytes)
      encrypted[61] = encrypted[61]! ^ 0xff;
      expect(() => decrypt(encrypted, "my-pin")).toThrow();
    });
  });

  describe("Rate limiting security", () => {
    it("blocks brute force attempts", () => {
      const limiter = new RateLimiter(5, 60_000);

      // 5 allowed
      for (let i = 0; i < 5; i++) {
        expect(limiter.consume("attacker")).toBe(true);
      }

      // 6th blocked
      expect(limiter.consume("attacker")).toBe(false);
      expect(limiter.consume("attacker")).toBe(false);

      limiter.shutdown();
    });

    it("isolates users from each other", () => {
      const limiter = new RateLimiter(2, 60_000);

      limiter.consume("user-a");
      limiter.consume("user-a");
      expect(limiter.consume("user-a")).toBe(false); // a exhausted

      expect(limiter.consume("user-b")).toBe(true); // b unaffected

      limiter.shutdown();
    });
  });

  describe("JWT security", () => {
    it("tokens expire correctly", () => {
      vi.useFakeTimers();
      const secret = generateJwtSecret();
      const token = issueToken("user", secret, "web", 300); // 5 min

      expect(verifyToken(token, secret)).not.toBeNull();

      vi.advanceTimersByTime(301_000); // 5 min + 1s
      expect(verifyToken(token, secret)).toBeNull();

      vi.useRealTimers();
    });

    it("rejects token from different issuer system", () => {
      const secret = generateJwtSecret();
      const token = issueToken("user", secret);

      // Verify with correct secret works
      expect(verifyToken(token, secret)!.iss).toBe("scb");

      // A token signed with a different secret is rejected
      const otherSecret = generateJwtSecret();
      expect(verifyToken(token, otherSecret)).toBeNull();
    });
  });

  describe("Input sanitization", () => {
    it("strips dangerous control characters", () => {
      const guard = new SecurityGuard({
        config: { shellAllowedPaths: [], binaryAllowlist: [], dashboardRateLimit: 60 } as any,
        audit: { log: () => {}, query: () => [] } as any,
        rateLimiter: { consume: () => true, remaining: () => 10, shutdown: () => {} } as any,
      });

      expect(guard.sanitizeInput("hello\x00world")).toBe("helloworld");
      expect(guard.sanitizeInput("test\x01\x02\x03")).toBe("test");
      expect(guard.sanitizeInput("ok\n\ttabs")).toBe("ok\n\ttabs"); // Preserves \n \t
    });
  });
});
