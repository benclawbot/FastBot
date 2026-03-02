import { createServer } from "node:http";
import { mkdirSync, existsSync } from "node:fs";
import { Server as SocketServer } from "socket.io";
import { loadConfig } from "./config/loader.js";
import { DATA_DIR } from "./config/defaults.js";
import { createChildLogger } from "./logger/index.js";
import { SQLiteDB } from "./memory/sqlite.js";
import { SessionManager } from "./session/manager.js";
import { KeyStore } from "./crypto/keystore.js";
import { AuditLog } from "./logger/audit.js";
import { RateLimiter } from "./security/rate-limiter.js";
import type { AppConfig } from "./config/schema.js";

const log = createChildLogger("gateway");

export interface GatewayContext {
  config: AppConfig;
  io: SocketServer;
  sessions: SessionManager;
  keyStore: KeyStore;
  audit: AuditLog;
  rateLimiter: RateLimiter;
  dashboardRateLimiter: RateLimiter;
  db: SQLiteDB;
}

async function main() {
  log.info("SecureClaudebot gateway starting...");

  // Ensure data directory exists
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  // Load config
  const config = loadConfig();

  // Initialize SQLite (pure JS/WASM, no native deps)
  const db = new SQLiteDB(config.memory.dbPath);
  await db.init();

  // Initialize core services
  const sessions = new SessionManager();
  const keyStore = new KeyStore(db, config.security.pin ?? "default-pin");
  const audit = new AuditLog(db);
  const rateLimiter = new RateLimiter(config.telegram.rateLimit);
  const dashboardRateLimiter = new RateLimiter(
    config.security.dashboardRateLimit
  );

  // Create HTTP + Socket.io server
  const httpServer = createServer();
  const io = new SocketServer(httpServer, {
    cors: {
      origin: `http://${config.server.host}:${config.server.dashboardPort}`,
      methods: ["GET", "POST"],
    },
    pingInterval: 25_000,
    pingTimeout: 10_000,
  });

  const ctx: GatewayContext = {
    config,
    io,
    sessions,
    keyStore,
    audit,
    rateLimiter,
    dashboardRateLimiter,
    db,
  };

  // Socket.io connection handler
  io.on("connection", (socket) => {
    log.info({ socketId: socket.id }, "Client connected");

    socket.on("chat:message", (data: { actorId: string; content: string }) => {
      // Rate limit check
      if (!dashboardRateLimiter.consume(data.actorId)) {
        socket.emit("chat:error", { error: "Rate limited. Try again shortly." });
        audit.log({
          event: "security.rate_limited",
          actor: data.actorId,
          detail: "Dashboard rate limit exceeded",
        });
        return;
      }

      // Debounce check
      if (sessions.isDuplicate(data.actorId, data.content)) {
        return;
      }

      const session = sessions.getOrCreate(data.actorId, "web");
      sessions.addMessage(session.id, "user", data.content);

      // Emit to all clients watching this session (web + telegram bridge)
      io.to(session.id).emit("chat:message", {
        sessionId: session.id,
        role: "user",
        content: data.content,
        ts: Date.now(),
      });

      // TODO: Route to LLM router for response generation
      log.info(
        { sessionId: session.id, actorId: data.actorId },
        "Message received"
      );
    });

    socket.on("session:join", (data: { actorId: string }) => {
      const session = sessions.getOrCreate(data.actorId, "web");
      socket.join(session.id);
      socket.emit("session:joined", {
        sessionId: session.id,
        messages: session.messages,
      });
    });

    socket.on("status:request", () => {
      socket.emit("status:update", getSystemStatus(ctx));
    });

    socket.on("disconnect", () => {
      log.debug({ socketId: socket.id }, "Client disconnected");
    });
  });

  // Start listening
  const { port, host } = config.server;
  httpServer.listen(port, host, () => {
    log.info({ host, port }, "Gateway listening");
    audit.log({
      event: "session.created",
      actor: "system",
      detail: `Gateway started on ${host}:${port}`,
    });
  });

  // Graceful shutdown
  const shutdown = () => {
    log.info("Shutting down...");
    sessions.shutdown();
    rateLimiter.shutdown();
    dashboardRateLimiter.shutdown();
    io.close();
    httpServer.close();
    db.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function getSystemStatus(ctx: GatewayContext) {
  return {
    gateway: "online",
    sessions: ctx.sessions.listActive().length,
    uptime: process.uptime(),
    memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    // Will be extended with Telegram, LLM, Playwright statuses
    subsystems: {
      telegram: "pending",
      llm: "pending",
      playwright: "pending",
      tailscale: "unknown",
    },
  };
}

main().catch((err) => {
  log.fatal({ err }, "Gateway failed to start");
  process.exit(1);
});
