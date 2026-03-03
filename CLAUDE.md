# SecureClaudebot

Ultra-secure personal AI gateway inspired by OpenClaw. Runs on Android (Termux) or any Node.js server.

## Architecture
- **Monorepo**: pnpm workspaces with 3 packages
  - `packages/gateway` — Node.js 22 + TypeScript, Socket.io hub, Telegram bot, LLM router, agent orchestrator
  - `packages/dashboard` — Next.js 15 PWA + Tailwind CSS 4 + React 19, auto-discovers gateway port
  - `packages/playwright` — Sandboxed Chromium worker for web automation

## Key Commands
- `pnpm dev` — Start all packages in development mode
- `pnpm build` — Build all packages
- `pnpm --filter @scb/gateway run dev` — Start gateway only
- `pnpm --filter @scb/dashboard run dev` — Start dashboard only

## Conventions
- TypeScript strict mode everywhere
- ESM (`"type": "module"`) for gateway and playwright packages
- All secrets encrypted with AES-256-GCM, key derived via PBKDF2 from user PIN
- Config validated with Zod schemas at startup
- Logging via pino with automatic secret redaction
- Security: SSRF blocking, path traversal prevention, binary allowlist, rate limiting, append-only audit log

## Ports
- **Gateway WebSocket**: 30000-65535 (randomized on first run for security, saved to config.json)
  - Dashboard auto-discovers the port on connection via `/api/gateway-info` endpoint
- **Dashboard**: 3100 (fixed)
