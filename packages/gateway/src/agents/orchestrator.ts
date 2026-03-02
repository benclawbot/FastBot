/**
 * Agent Orchestrator — spawns, tracks, and manages sub-agents.
 * Each agent runs as an async task with timeout enforcement.
 */
import { randomBytes } from "node:crypto";
import { createChildLogger } from "../logger/index.js";
import {
  MAX_CONCURRENT_AGENTS,
  AGENT_TIMEOUT_MS,
} from "../config/defaults.js";
import type { AuditLog } from "../logger/audit.js";
import type { SecurityGuard } from "../security/guard.js";

const log = createChildLogger("agent:orchestrator");

export type AgentStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface AgentTask {
  id: string;
  name: string;
  description: string;
  status: AgentStatus;
  sessionId: string;
  actorId: string;
  result?: string;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  /** Progress 0-100 */
  progress: number;
}

export type AgentExecutor = (
  task: AgentTask,
  signal: AbortSignal
) => Promise<string>;

/**
 * Manages the lifecycle of sub-agent tasks with concurrency limits,
 * timeouts, and Kanban-style status tracking.
 */
export class AgentOrchestrator {
  private tasks = new Map<string, AgentTask>();
  private executors = new Map<string, AgentExecutor>();
  private abortControllers = new Map<string, AbortController>();
  private runningCount = 0;
  private queue: string[] = [];
  private audit: AuditLog;
  private guard: SecurityGuard;

  constructor(audit: AuditLog, guard: SecurityGuard) {
    this.audit = audit;
    this.guard = guard;
    log.info({ maxConcurrent: MAX_CONCURRENT_AGENTS }, "Agent orchestrator initialized");
  }

  /**
   * Register a named agent executor (e.g., "shell", "web", "code").
   */
  registerExecutor(name: string, executor: AgentExecutor): void {
    this.executors.set(name, executor);
    log.info({ agent: name }, "Agent executor registered");
  }

  /**
   * Spawn a new agent task. Queues if at concurrency limit.
   */
  spawn(
    name: string,
    description: string,
    sessionId: string,
    actorId: string
  ): AgentTask {
    if (!this.executors.has(name)) {
      throw new Error(`Unknown agent type: ${name}`);
    }

    const id = randomBytes(8).toString("hex");
    const task: AgentTask = {
      id,
      name,
      description,
      status: "pending",
      sessionId,
      actorId,
      createdAt: Date.now(),
      progress: 0,
    };

    this.tasks.set(id, task);

    this.audit.log({
      event: "agent.spawned",
      actor: actorId,
      detail: `Agent spawned: ${name} — ${description}`,
    });

    // Try to run immediately or queue
    if (this.runningCount < MAX_CONCURRENT_AGENTS) {
      this.executeTask(id);
    } else {
      this.queue.push(id);
      log.info({ taskId: id, queueLen: this.queue.length }, "Agent queued (at capacity)");
    }

    return task;
  }

  /**
   * Cancel a running or pending task.
   */
  cancel(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    if (task.status === "pending") {
      task.status = "cancelled";
      task.completedAt = Date.now();
      this.queue = this.queue.filter((id) => id !== taskId);
      return true;
    }

    if (task.status === "running") {
      const controller = this.abortControllers.get(taskId);
      if (controller) {
        controller.abort();
        this.abortControllers.delete(taskId);
      }
      task.status = "cancelled";
      task.completedAt = Date.now();
      this.runningCount--;
      this.drainQueue();
      return true;
    }

    return false;
  }

  /**
   * Update progress for a running task.
   */
  updateProgress(taskId: string, progress: number): void {
    const task = this.tasks.get(taskId);
    if (task && task.status === "running") {
      task.progress = Math.max(0, Math.min(100, progress));
    }
  }

  /**
   * Get a task by ID.
   */
  getTask(taskId: string): AgentTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks, optionally filtered by status.
   */
  listTasks(filter?: AgentStatus | AgentStatus[]): AgentTask[] {
    const all = Array.from(this.tasks.values());
    if (!filter) return all;

    const statuses = Array.isArray(filter) ? filter : [filter];
    return all.filter((t) => statuses.includes(t.status));
  }

  /**
   * Get Kanban-style board: tasks grouped by status.
   */
  getBoard(): Record<AgentStatus, AgentTask[]> {
    const board: Record<AgentStatus, AgentTask[]> = {
      pending: [],
      running: [],
      completed: [],
      failed: [],
      cancelled: [],
    };

    for (const task of this.tasks.values()) {
      board[task.status].push(task);
    }

    return board;
  }

  /**
   * Get task counts by status.
   */
  getCounts(): Record<AgentStatus, number> {
    const counts: Record<AgentStatus, number> = {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    for (const task of this.tasks.values()) {
      counts[task.status]++;
    }

    return counts;
  }

  /**
   * Clean up old completed/failed/cancelled tasks.
   */
  cleanup(maxAge = 3600_000): number {
    const now = Date.now();
    let removed = 0;
    const doneStatuses: AgentStatus[] = ["completed", "failed", "cancelled"];

    for (const [id, task] of this.tasks) {
      if (
        doneStatuses.includes(task.status) &&
        task.completedAt &&
        now - task.completedAt > maxAge
      ) {
        this.tasks.delete(id);
        removed++;
      }
    }

    if (removed > 0) {
      log.info({ removed }, "Cleaned up old agent tasks");
    }

    return removed;
  }

  // ── Private ──

  private async executeTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const executor = this.executors.get(task.name);
    if (!executor) {
      task.status = "failed";
      task.error = `No executor for agent type: ${task.name}`;
      task.completedAt = Date.now();
      return;
    }

    const controller = new AbortController();
    this.abortControllers.set(taskId, controller);

    // Timeout enforcement
    const timeout = setTimeout(() => {
      controller.abort();
      log.warn({ taskId }, "Agent task timed out");
    }, AGENT_TIMEOUT_MS);

    task.status = "running";
    task.startedAt = Date.now();
    this.runningCount++;

    try {
      const result = await executor(task, controller.signal);
      task.status = "completed";
      task.result = result;
      task.progress = 100;

      this.audit.log({
        event: "agent.completed",
        actor: task.actorId,
        detail: `Agent completed: ${task.name} (${taskId})`,
      });

      log.info({ taskId, name: task.name }, "Agent task completed");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);

      if (controller.signal.aborted) {
        task.status = "cancelled";
        task.error = "Timed out or cancelled";
      } else {
        task.status = "failed";
        task.error = msg;
        this.audit.log({
          event: "agent.failed",
          actor: task.actorId,
          detail: `Agent failed: ${task.name} — ${msg}`,
        });
      }

      log.error({ taskId, err: msg }, "Agent task failed");
    } finally {
      task.completedAt = Date.now();
      this.abortControllers.delete(taskId);
      clearTimeout(timeout);
      this.runningCount--;
      this.drainQueue();
    }
  }

  private drainQueue(): void {
    while (this.queue.length > 0 && this.runningCount < MAX_CONCURRENT_AGENTS) {
      const nextId = this.queue.shift()!;
      const nextTask = this.tasks.get(nextId);
      if (nextTask && nextTask.status === "pending") {
        this.executeTask(nextId);
      }
    }
  }
}
