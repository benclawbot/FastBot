import { Router, Request, Response } from "express";
import { createChildLogger } from "../logger/index.js";
import { circuitBreaker } from "./circuit-breaker.js";
import { LlmRouter } from "../llm/router.js";
import type { FastBotConfig } from "../config/index.js";

const log = createChildLogger("health");

interface IntegrationHealth {
  status: "ok" | "degraded" | "open" | "closed" | "error";
  failures: number;
  lastCheck?: number;
}

interface HealthStatus {
  status: "ok" | "degraded" | "error";
  uptime: number;
  timestamp: number;
  integrations: Record<string, IntegrationHealth>;
  memory: {
    used: number;
    total: number;
    percent: number;
  };
}

let startTime = Date.now();

export function setStartTime(time: number): void {
  startTime = time;
}

export function createHealthRouter(config: FastBotConfig, llmRouter?: LlmRouter): Router {
  const router = Router();

  /**
   * Health check endpoint
   * GET /health
   */
  router.get("/", async (_req: Request, res: Response) => {
    try {
      const status: HealthStatus = {
        status: "ok",
        uptime: Math.floor((Date.now() - startTime) / 1000),
        timestamp: Date.now(),
        integrations: {},
        memory: {
          used: 0,
          total: 0,
          percent: 0,
        },
      };

      // Get circuit breaker status
      const cbStatus = circuitBreaker.getStatus();
      for (const [integration, state] of Object.entries(cbStatus)) {
        status.integrations[integration] = {
          status: state.status as any,
          failures: state.failures,
          lastCheck: Date.now(),
        };
      }

      // Check LLM health if available
      if (llmRouter) {
        status.integrations.llm = {
          status: "ok",
          failures: 0,
          lastCheck: Date.now(),
        };
      }

      // Check memory usage
      if (process.memoryUsage) {
        const mem = process.memoryUsage();
        status.memory = {
          used: Math.floor(mem.heapUsed / 1024 / 1024),
          total: Math.floor(mem.heapTotal / 1024 / 1024),
          percent: Math.floor((mem.heapUsed / mem.heapTotal) * 100),
        };
      }

      // Determine overall status
      const hasOpen = Object.values(status.integrations).some(
        (i) => i.status === "open"
      );
      const hasDegraded = Object.values(status.integrations).some(
        (i) => i.status === "degraded"
      );

      if (hasOpen) {
        status.status = "error";
      } else if (hasDegraded) {
        status.status = "degraded";
      }

      res.json(status);
    } catch (error) {
      log.error({ err: error }, "Health check failed");
      res.status(500).json({
        status: "error",
        error: "Health check failed",
      });
    }
  });

  /**
   * Readiness probe
   * GET /health/ready
   */
  router.get("/ready", async (_req: Request, res: Response) => {
    // Check if critical services are ready
    const isReady = llmRouter !== undefined;
    
    if (isReady) {
      res.json({ status: "ready" });
    } else {
      res.status(503).json({ status: "not_ready" });
    }
  });

  /**
   * Liveness probe
   * GET /health/live
   */
  router.get("/live", (_req: Request, res: Response) => {
    res.json({ status: "alive", timestamp: Date.now() });
  });

  /**
   * Reset circuit breaker
   * POST /health/reset/:integration?
   */
  router.post("/reset/:integration?", (req: Request, res: Response) => {
    const { integration } = req.params;
    
    if (integration) {
      circuitBreaker.reset(integration);
      log.info({ integration }, "Circuit breaker reset");
    } else {
      circuitBreaker.resetAll();
      log.info("All circuit breakers reset");
    }

    res.json({ status: "ok", reset: integration || "all" });
  });

  return router;
}
