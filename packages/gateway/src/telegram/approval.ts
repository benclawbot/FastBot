import { randomInt } from "node:crypto";
import { createChildLogger } from "../logger/index.js";

const log = createChildLogger("telegram:approval");

interface PendingApproval {
  code: string;
  createdAt: number;
  attempts: number;
}

/** Approval codes expire after 5 minutes */
const CODE_TTL_MS = 5 * 60 * 1000;
/** Max failed attempts before blocking */
const MAX_ATTEMPTS = 3;

/**
 * DM approval system for unknown Telegram senders.
 * Generates 6-digit codes that must be confirmed before messages are processed.
 */
export class ApprovalManager {
  private pending = new Map<number, PendingApproval>();
  private approved = new Set<number>();
  private blocked = new Set<number>();

  constructor(preApprovedUsers: number[] = []) {
    for (const id of preApprovedUsers) {
      this.approved.add(id);
    }
    log.info(
      { preApproved: preApprovedUsers.length },
      "Approval manager initialized"
    );
  }

  /**
   * Check if a user is approved.
   */
  isApproved(userId: number): boolean {
    return this.approved.has(userId);
  }

  /**
   * Check if a user is blocked (too many failed attempts).
   */
  isBlocked(userId: number): boolean {
    return this.blocked.has(userId);
  }

  /**
   * Generate an approval code for a user.
   * Returns the 6-digit code to display.
   */
  generateCode(userId: number): string {
    if (this.approved.has(userId)) return "";
    if (this.blocked.has(userId)) return "";

    const code = String(randomInt(100_000, 999_999));
    this.pending.set(userId, { code, createdAt: Date.now(), attempts: 0 });
    log.info({ userId }, "Approval code generated");
    return code;
  }

  /**
   * Verify a submitted code.
   * Returns true if approved, false if wrong.
   */
  verify(userId: number, submittedCode: string): boolean {
    const entry = this.pending.get(userId);
    if (!entry) return false;

    // Check expiry
    if (Date.now() - entry.createdAt > CODE_TTL_MS) {
      this.pending.delete(userId);
      log.warn({ userId }, "Approval code expired");
      return false;
    }

    if (entry.code === submittedCode.trim()) {
      this.approved.add(userId);
      this.pending.delete(userId);
      log.info({ userId }, "User approved");
      return true;
    }

    entry.attempts++;
    if (entry.attempts >= MAX_ATTEMPTS) {
      this.pending.delete(userId);
      this.blocked.add(userId);
      log.warn({ userId }, "User blocked after too many failed attempts");
    }

    return false;
  }

  /**
   * Manually approve a user (e.g., from dashboard).
   */
  manualApprove(userId: number): void {
    this.approved.add(userId);
    this.pending.delete(userId);
    this.blocked.delete(userId);
    log.info({ userId }, "User manually approved");
  }

  /**
   * Revoke approval for a user.
   */
  revoke(userId: number): void {
    this.approved.delete(userId);
    log.info({ userId }, "User approval revoked");
  }

  /**
   * Get status summary for the dashboard.
   */
  status(): {
    approved: number[];
    pending: number[];
    blocked: number[];
  } {
    return {
      approved: Array.from(this.approved),
      pending: Array.from(this.pending.keys()),
      blocked: Array.from(this.blocked),
    };
  }
}
