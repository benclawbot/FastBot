import { spawn, type ChildProcess } from "node:child_process";
import { createChildLogger } from "./logger/index.js";
import {
  HEARTBEAT_INTERVAL_MS,
  WATCHDOG_INTERVAL_MS,
  MAX_RESTART_ATTEMPTS,
  RESTART_BACKOFF_BASE_MS,
} from "./config/defaults.js";

const log = createChildLogger("supervisor");

interface ManagedProcess {
  name: string;
  command: string;
  args: string[];
  process: ChildProcess | null;
  restartCount: number;
  lastStarted: number;
  healthy: boolean;
}

/**
 * Supervisor that manages gateway + playwright worker processes.
 * Provides heartbeat monitoring, watchdog checks, and auto-restart with backoff.
 */
export class Supervisor {
  private managed = new Map<string, ManagedProcess>();
  private heartbeatHandle: ReturnType<typeof setInterval> | null = null;
  private watchdogHandle: ReturnType<typeof setInterval> | null = null;
  private shuttingDown = false;

  /**
   * Register a process to be managed.
   */
  register(name: string, command: string, args: string[]): void {
    this.managed.set(name, {
      name,
      command,
      args,
      process: null,
      restartCount: 0,
      lastStarted: 0,
      healthy: false,
    });
    log.info({ name, command, args }, "Process registered");
  }

  /**
   * Start all registered processes and begin monitoring.
   */
  startAll(): void {
    for (const [name] of this.managed) {
      this.startProcess(name);
    }
    this.startHeartbeat();
    this.startWatchdog();
    log.info("Supervisor started — all processes launched");
  }

  private startProcess(name: string): void {
    const entry = this.managed.get(name);
    if (!entry) return;

    const backoff = Math.min(
      RESTART_BACKOFF_BASE_MS * 2 ** entry.restartCount,
      60_000
    );

    if (entry.restartCount > 0) {
      log.info(
        { name, attempt: entry.restartCount, backoffMs: backoff },
        "Restarting with backoff"
      );
    }

    const child = spawn(entry.command, entry.args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    child.stdout?.on("data", (data: Buffer) => {
      const line = data.toString().trim();
      if (line) log.info({ name }, line);
    });

    child.stderr?.on("data", (data: Buffer) => {
      const line = data.toString().trim();
      if (line) log.error({ name }, line);
    });

    child.on("exit", (code, signal) => {
      log.warn({ name, code, signal }, "Process exited");
      entry.process = null;
      entry.healthy = false;

      if (!this.shuttingDown) {
        if (entry.restartCount < MAX_RESTART_ATTEMPTS) {
          entry.restartCount++;
          const delay = Math.min(
            RESTART_BACKOFF_BASE_MS * 2 ** (entry.restartCount - 1),
            60_000
          );
          setTimeout(() => this.startProcess(name), delay);
        } else {
          log.error(
            { name, attempts: MAX_RESTART_ATTEMPTS },
            "Max restart attempts reached — process abandoned"
          );
        }
      }
    });

    entry.process = child;
    entry.lastStarted = Date.now();
    entry.healthy = true;

    // Reset restart count after 2 minutes of stable running
    setTimeout(() => {
      if (entry.process === child && entry.healthy) {
        entry.restartCount = 0;
      }
    }, 120_000);

    log.info({ name, pid: child.pid }, "Process started");
  }

  private startHeartbeat(): void {
    this.heartbeatHandle = setInterval(() => {
      for (const [name, entry] of this.managed) {
        const alive = entry.process !== null && entry.process.exitCode === null;
        entry.healthy = alive;

        if (!alive && !this.shuttingDown) {
          log.warn({ name }, "Heartbeat: process not alive");
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private startWatchdog(): void {
    this.watchdogHandle = setInterval(() => {
      for (const [name, entry] of this.managed) {
        if (!entry.healthy && !this.shuttingDown && entry.process === null) {
          if (entry.restartCount < MAX_RESTART_ATTEMPTS) {
            log.warn({ name }, "Watchdog: triggering restart");
            this.startProcess(name);
          }
        }
      }
    }, WATCHDOG_INTERVAL_MS);
  }

  /**
   * Get health status of all managed processes.
   */
  status(): Array<{
    name: string;
    pid: number | undefined;
    healthy: boolean;
    restartCount: number;
    uptimeMs: number;
  }> {
    return Array.from(this.managed.values()).map((entry) => ({
      name: entry.name,
      pid: entry.process?.pid,
      healthy: entry.healthy,
      restartCount: entry.restartCount,
      uptimeMs: entry.lastStarted > 0 ? Date.now() - entry.lastStarted : 0,
    }));
  }

  /**
   * Gracefully shut down all processes.
   */
  shutdown(): void {
    this.shuttingDown = true;
    if (this.heartbeatHandle) clearInterval(this.heartbeatHandle);
    if (this.watchdogHandle) clearInterval(this.watchdogHandle);

    for (const [name, entry] of this.managed) {
      if (entry.process) {
        log.info({ name, pid: entry.process.pid }, "Stopping process");
        entry.process.kill("SIGTERM");
      }
    }
  }
}
