import { describe, it, expect, beforeEach, vi } from "vitest";
import { AgentOrchestrator, type AgentExecutor } from "./orchestrator.js";

function mockAudit() {
  return { log: vi.fn(), query: vi.fn(() => []) } as any;
}

function mockGuard() {
  return {
    checkUrl: vi.fn(() => ({ allowed: true })),
    checkPath: vi.fn(() => ({ allowed: true })),
    checkBinary: vi.fn(() => ({ allowed: true })),
    checkRateLimit: vi.fn(() => ({ allowed: true })),
    checkShellCommand: vi.fn(() => ({ allowed: true })),
    sanitizeInput: vi.fn((s: string) => s),
    validateChatMessage: vi.fn((s: string) => ({ allowed: true, sanitized: s })),
  } as any;
}

describe("AgentOrchestrator", () => {
  let orchestrator: AgentOrchestrator;
  let audit: ReturnType<typeof mockAudit>;

  beforeEach(() => {
    audit = mockAudit();
    orchestrator = new AgentOrchestrator(audit, mockGuard());
  });

  describe("registerExecutor", () => {
    it("registers an executor", () => {
      const exec: AgentExecutor = async () => "done";
      orchestrator.registerExecutor("test", exec);
      // Should not throw when spawning
      const task = orchestrator.spawn("test", "Test task", "session-1", "user-1");
      expect(task.name).toBe("test");
    });

    it("throws for unknown agent type on spawn", () => {
      expect(() =>
        orchestrator.spawn("unknown", "Desc", "s1", "u1")
      ).toThrow("Unknown agent type: unknown");
    });
  });

  describe("spawn", () => {
    it("creates a task with correct fields", () => {
      orchestrator.registerExecutor("test", async () => "done");
      const task = orchestrator.spawn("test", "My task", "session-1", "user-1");

      expect(task.id).toHaveLength(16); // 8 random bytes hex
      expect(task.name).toBe("test");
      expect(task.description).toBe("My task");
      expect(task.sessionId).toBe("session-1");
      expect(task.actorId).toBe("user-1");
      expect(task.progress).toBe(0);
      expect(task.createdAt).toBeGreaterThan(0);
    });

    it("logs to audit on spawn", () => {
      orchestrator.registerExecutor("test", async () => "done");
      orchestrator.spawn("test", "My task", "s1", "u1");

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ event: "agent.spawned" })
      );
    });
  });

  describe("task execution", () => {
    it("runs task to completion", async () => {
      const exec: AgentExecutor = async () => "result-42";
      orchestrator.registerExecutor("test", exec);

      const task = orchestrator.spawn("test", "Desc", "s1", "u1");

      // Wait for async execution
      await new Promise((r) => setTimeout(r, 50));

      const updated = orchestrator.getTask(task.id)!;
      expect(updated.status).toBe("completed");
      expect(updated.result).toBe("result-42");
      expect(updated.progress).toBe(100);
      expect(updated.completedAt).toBeGreaterThan(0);
    });

    it("marks task as failed on executor error", async () => {
      const exec: AgentExecutor = async () => {
        throw new Error("boom");
      };
      orchestrator.registerExecutor("fail", exec);

      const task = orchestrator.spawn("fail", "Desc", "s1", "u1");

      await new Promise((r) => setTimeout(r, 50));

      const updated = orchestrator.getTask(task.id)!;
      expect(updated.status).toBe("failed");
      expect(updated.error).toBe("boom");
    });

    it("logs to audit on completion", async () => {
      orchestrator.registerExecutor("test", async () => "ok");
      orchestrator.spawn("test", "Desc", "s1", "u1");

      await new Promise((r) => setTimeout(r, 50));

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ event: "agent.completed" })
      );
    });

    it("logs to audit on failure", async () => {
      orchestrator.registerExecutor("fail", async () => {
        throw new Error("broken");
      });
      orchestrator.spawn("fail", "Desc", "s1", "u1");

      await new Promise((r) => setTimeout(r, 50));

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ event: "agent.failed" })
      );
    });
  });

  describe("cancel", () => {
    it("cancels a pending task", async () => {
      // Fill up concurrency so next task queues
      const slow: AgentExecutor = () =>
        new Promise((r) => setTimeout(() => r("done"), 5000));
      orchestrator.registerExecutor("slow", slow);

      // Spawn max concurrent
      for (let i = 0; i < 5; i++) {
        orchestrator.spawn("slow", `Task ${i}`, "s1", "u1");
      }

      // This one should be queued (pending)
      const queued = orchestrator.spawn("slow", "Queued", "s1", "u1");
      expect(queued.status).toBe("pending");

      const cancelled = orchestrator.cancel(queued.id);
      expect(cancelled).toBe(true);

      const updated = orchestrator.getTask(queued.id)!;
      expect(updated.status).toBe("cancelled");
    });

    it("returns false for non-existent task", () => {
      expect(orchestrator.cancel("nonexistent")).toBe(false);
    });
  });

  describe("updateProgress", () => {
    it("updates progress on a running task", async () => {
      let resolveTask!: (v: string) => void;
      const exec: AgentExecutor = () =>
        new Promise((r) => {
          resolveTask = r;
        });
      orchestrator.registerExecutor("progress", exec);

      const task = orchestrator.spawn("progress", "Desc", "s1", "u1");

      await new Promise((r) => setTimeout(r, 20));

      orchestrator.updateProgress(task.id, 50);
      expect(orchestrator.getTask(task.id)!.progress).toBe(50);

      orchestrator.updateProgress(task.id, 150); // Should clamp to 100
      expect(orchestrator.getTask(task.id)!.progress).toBe(100);

      orchestrator.updateProgress(task.id, -10); // Should clamp to 0
      expect(orchestrator.getTask(task.id)!.progress).toBe(0);

      resolveTask("done");
    });
  });

  describe("getBoard", () => {
    it("returns tasks grouped by status", async () => {
      orchestrator.registerExecutor("ok", async () => "done");
      orchestrator.registerExecutor("err", async () => {
        throw new Error("no");
      });

      orchestrator.spawn("ok", "Task 1", "s1", "u1");
      orchestrator.spawn("err", "Task 2", "s1", "u1");

      await new Promise((r) => setTimeout(r, 100));

      const board = orchestrator.getBoard();
      expect(board.completed.length).toBe(1);
      expect(board.failed.length).toBe(1);
    });
  });

  describe("getCounts", () => {
    it("returns correct counts", async () => {
      orchestrator.registerExecutor("ok", async () => "done");
      orchestrator.spawn("ok", "T1", "s1", "u1");
      orchestrator.spawn("ok", "T2", "s1", "u1");

      await new Promise((r) => setTimeout(r, 100));

      const counts = orchestrator.getCounts();
      expect(counts.completed).toBe(2);
      expect(counts.pending).toBe(0);
      expect(counts.running).toBe(0);
    });
  });

  describe("listTasks", () => {
    it("lists all tasks without filter", async () => {
      orchestrator.registerExecutor("ok", async () => "done");
      orchestrator.spawn("ok", "T1", "s1", "u1");
      orchestrator.spawn("ok", "T2", "s1", "u1");

      await new Promise((r) => setTimeout(r, 100));

      expect(orchestrator.listTasks().length).toBe(2);
    });

    it("filters by status", async () => {
      orchestrator.registerExecutor("ok", async () => "done");
      orchestrator.registerExecutor("err", async () => {
        throw new Error("no");
      });
      orchestrator.spawn("ok", "T1", "s1", "u1");
      orchestrator.spawn("err", "T2", "s1", "u1");

      await new Promise((r) => setTimeout(r, 100));

      expect(orchestrator.listTasks("completed").length).toBe(1);
      expect(orchestrator.listTasks("failed").length).toBe(1);
      expect(orchestrator.listTasks(["completed", "failed"]).length).toBe(2);
    });
  });

  describe("cleanup", () => {
    it("removes old completed tasks", async () => {
      vi.useFakeTimers();
      orchestrator.registerExecutor("ok", async () => "done");
      orchestrator.spawn("ok", "Old task", "s1", "u1");

      // Let it complete
      await vi.advanceTimersByTimeAsync(100);

      // Age it
      vi.advanceTimersByTime(7200_000);

      const removed = orchestrator.cleanup(3600_000);
      expect(removed).toBe(1);
      expect(orchestrator.listTasks().length).toBe(0);

      vi.useRealTimers();
    });
  });
});
