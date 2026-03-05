import { randomBytes } from "node:crypto";
import { createChildLogger } from "../logger/index.js";
import {
  SESSION_TIMEOUT_MS,
  SESSION_REAPER_INTERVAL_MS,
  DEBOUNCE_WINDOW_MS,
} from "../config/defaults.js";

const log = createChildLogger("session");

export interface Session {
  id: string;
  /** Source that created this session: "telegram" | "web" */
  origin: "telegram" | "web";
  /** Telegram user ID or web JWT subject */
  actorId: string;
  /** Conversation messages */
  messages: Array<{ role: "user" | "assistant"; content: string; ts: number }>;
  createdAt: number;
  lastActivity: number;
  /** Write lock — only one writer at a time */
  locked: boolean;
  /** Abort controller for stopping streaming responses */
  abortController: AbortController | null;
}

export class SessionManager {
  private sessions = new Map<string, Session>();
  private reaperHandle: ReturnType<typeof setInterval> | null = null;
  /** Maps actorId → sessionId for session sharing between Telegram + web */
  private actorIndex = new Map<string, string>();
  /** Debounce: msgHash → timestamp */
  private recentMessages = new Map<string, number>();

  constructor() {
    this.startReaper();
    log.info("Session manager initialized");
  }

  /**
   * Get or create a session for an actor.
   * Both Telegram and web share the same session per actorId.
   */
  getOrCreate(actorId: string, origin: "telegram" | "web"): Session {
    const existing = this.actorIndex.get(actorId);
    if (existing) {
      const session = this.sessions.get(existing)!;
      session.lastActivity = Date.now();
      return session;
    }

    const id = randomBytes(16).toString("hex");
    const session: Session = {
      id,
      origin,
      actorId,
      messages: [],
      createdAt: Date.now(),
      lastActivity: Date.now(),
      locked: false,
      abortController: null,
    };
    this.sessions.set(id, session);
    this.actorIndex.set(actorId, id);
    log.info({ sessionId: id, actorId, origin }, "Session created");
    return session;
  }

  get(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  getByActor(actorId: string): Session | undefined {
    const sid = this.actorIndex.get(actorId);
    return sid ? this.sessions.get(sid) : undefined;
  }

  /**
   * Acquire write lock. Returns false if already locked.
   */
  acquireLock(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.locked) return false;
    session.locked = true;
    return true;
  }

  releaseLock(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) session.locked = false;
  }

  /**
   * Get the abort controller for a session
   */
  getAbortController(sessionId: string): AbortController | null {
    const session = this.sessions.get(sessionId);
    return session?.abortController || null;
  }

  /**
   * Set the abort controller for a session
   */
  setAbortController(sessionId: string, controller: AbortController | null): void {
    const session = this.sessions.get(sessionId);
    if (session) session.abortController = controller;
  }

  /**
   * Abort the current streaming response for a session
   */
  abortStreaming(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session?.abortController) {
      session.abortController.abort();
      session.abortController = null;
      return true;
    }
    return false;
  }

  /**
   * Check for duplicate messages within the debounce window.
   * Returns true if this message is a duplicate that should be ignored.
   */
  isDuplicate(actorId: string, content: string): boolean {
    const hash = `${actorId}:${content}`;
    const last = this.recentMessages.get(hash);
    const now = Date.now();

    if (last && now - last < DEBOUNCE_WINDOW_MS) {
      log.debug({ actorId }, "Duplicate message suppressed");
      return true;
    }

    this.recentMessages.set(hash, now);
    return false;
  }

  /**
   * Add a message to a session.
   */
  addMessage(
    sessionId: string,
    role: "user" | "assistant",
    content: string
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.messages.push({ role, content, ts: Date.now() });
    session.lastActivity = Date.now();
  }

  /**
   * Destroy a session.
   */
  destroy(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.actorIndex.delete(session.actorId);
      this.sessions.delete(sessionId);
      log.info({ sessionId }, "Session destroyed");
    }
  }

  /**
   * Get all active sessions (for status panel).
   */
  listActive(): Session[] {
    return Array.from(this.sessions.values());
  }

  private startReaper(): void {
    this.reaperHandle = setInterval(() => {
      const now = Date.now();
      let reaped = 0;

      for (const [id, session] of this.sessions) {
        if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
          this.actorIndex.delete(session.actorId);
          this.sessions.delete(id);
          reaped++;
        }
      }

      // Clean debounce cache
      for (const [hash, ts] of this.recentMessages) {
        if (now - ts > DEBOUNCE_WINDOW_MS * 2) {
          this.recentMessages.delete(hash);
        }
      }

      if (reaped > 0) {
        log.info({ reaped, remaining: this.sessions.size }, "Sessions reaped");
      }
    }, SESSION_REAPER_INTERVAL_MS);
  }

  shutdown(): void {
    if (this.reaperHandle) clearInterval(this.reaperHandle);
  }
}
