# SecuredClaudeBot

Ultra-secure personal AI gateway inspired by OpenClaw. Runs on Android (Termux) or any Node.js server.

## Features

- **Telegram Bot** - Control your AI agent via Telegram
- **Multi-Provider LLM Router** - OpenAI, Anthropic, Google, Ollama
- **Web Dashboard** - Next.js PWA for mission control
- **Sandboxed Browser** - Playwright-based web automation
- **Audit Logging** - Full activity tracking
- **Security Hardened** - SSRF blocking, path traversal prevention, rate limiting

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     SecuredClaudeBot                        │
├─────────────────────────────────────────────────────────────┤
│  packages/gateway    — Node.js 22 + TypeScript            │
│  ├── Socket.io hub for real-time communication            │
│  ├── Telegram bot command handler                          │
│  ├── LLM router (OpenAI, Anthropic, Google, Ollama)      │
│  ├── Agent orchestrator                                   │
│  └── Security: SSRF, path traversal, rate limiting       │
├─────────────────────────────────────────────────────────────┤
│  packages/dashboard   — Next.js 14 PWA                    │
│  ├── Kanban board for task management                     │
│  ├── Chat interface                                       │
│  ├── Usage statistics                                     │
│  └── Settings panel                                       │
├─────────────────────────────────────────────────────────────┤
│  packages/playwright — Sandboxed Chromium worker          │
│  ├── Web scraping (scrape, automate, screenshot)          │
│  ├── Isolated from host system                            │
│  └── Communicates via stdin/stdout JSON-RPC               │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 10+
- (Optional) Telegram bot token from @BotFather

### Installation

```bash
# Clone the repository
git clone https://github.com/benclawbot/SecuredClaudeBot.git
cd SecuredClaudeBot

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### Configuration

Create `.env` in `packages/gateway/`:

```env
# Required: Telegram Bot Token from @BotFather
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Required: Secret for JWT tokens
JWT_SECRET=your_super_secret_jwt_key

# Optional: LLM API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_GENERATIVE_AI_API_KEY=...
OLLAMA_BASE_URL=http://localhost:11434

# Optional: Database path
DB_PATH=./data/scb.db
```

### Running

```bash
# Start all packages (development)
pnpm dev

# Or start individually:
pnpm --filter @scb/gateway run dev    # Gateway: ws://localhost:18789
pnpm --filter @scb/dashboard run dev  # Dashboard: http://localhost:3100
```

## Packages

### @scb/gateway

The core gateway service.

**Ports:**
- WebSocket: `18789`
- HTTP: `18788` (optional)

**Environment Variables:**
| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | Telegram bot token |
| `JWT_SECRET` | Yes | Secret for JWT signing |
| `OPENAI_API_KEY` | No | OpenAI API key |
| `ANTHROPIC_API_KEY` | No | Anthropic API key |
| `GOOGLE_GENERATIVE_AI_API_KEY` | No | Google AI API key |
| `OLLAMA_BASE_URL` | No | Ollama server URL |
| `DB_PATH` | No | SQLite database path |

### @scb/dashboard

Next.js PWA for user interface.

**Ports:**
- Dashboard: `3100`

**Pages:**
- `/` - Dashboard home
- `/chat` - Chat interface
- `/kanban` - Task board
- `/status` - System status
- `/usage` - Usage statistics
- `/settings` - Configuration

### @scb/playwright

Sandboxed browser automation worker.

**Commands:**
- `scrape` - Extract page title and text
- `screenshot` - Take a screenshot
- `automate` - Run a sequence of actions

## Security

### Implemented Protections

1. **SSRF Blocking** - Prevents access to internal networks
2. **Path Traversal Prevention** - Blocks directory traversal attacks
3. **Binary Allowlist** - Only allowed executables can run
4. **Rate Limiting** - Prevents abuse
5. **Audit Logging** - Append-only log of all activities
6. **Encrypted Secrets** - AES-256-GCM encryption with PBKDF2 key derivation

### Audit Events

| Event | Description |
|-------|-------------|
| `auth.login` | Successful login |
| `auth.login_failed` | Failed login attempt |
| `tool.executed` | Tool was executed |
| `tool.blocked` | Tool was blocked |
| `security.ssrf_blocked` | SSRF attack blocked |
| `security.path_traversal` | Path traversal blocked |
| `security.rate_limited` | Rate limit exceeded |
| `agent.spawned` | Agent spawned |
| `agent.completed` | Agent completed |
| `session.created` | New session created |

## Commands (Telegram)

```
/start - Start the bot
/help - Show help message
/status - Check system status
/models - List available LLM models
```

## Development

```bash
# Type check all packages
pnpm build

# Run tests
pnpm --filter @scb/gateway test

# Lint
pnpm lint
```

## Troubleshooting

### Build Errors

If you get TypeScript errors about `document` in playwright:
```bash
# The tsconfig needs "DOM" lib
# Already fixed in packages/playwright/tsconfig.json
```

### Port Conflicts

If ports are already in use:
- Gateway: Set `PORT=18789` env variable
- Dashboard: Set `PORT=3100` env variable

### Database Issues

Delete the database file and restart:
```bash
rm packages/gateway/data/scb.db
```

## License

MIT
