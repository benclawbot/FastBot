import { resolve } from "node:path";

/** Default data directory for SQLite DBs, logs, media */
export const DATA_DIR = resolve(process.cwd(), "data");

/** Default log directory */
export const LOG_DIR = resolve(process.cwd(), "logs");

/** Default media storage directory */
export const MEDIA_DIR = resolve(DATA_DIR, "media");

/** Default config file path */
export const CONFIG_PATH = resolve(process.cwd(), "config.json");

/** Max message length for Telegram before chunking */
export const TELEGRAM_MAX_LENGTH = 4096;

/** Session timeout: 30 minutes of inactivity */
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/** Session reaper interval: every 5 minutes */
export const SESSION_REAPER_INTERVAL_MS = 5 * 60 * 1000;

/** Maximum number of active sessions */
export const MAX_SESSIONS = 100;

/** Heartbeat interval: every 30 seconds */
export const HEARTBEAT_INTERVAL_MS = 30 * 1000;

/** Watchdog check interval: every 10 seconds */
export const WATCHDOG_INTERVAL_MS = 10 * 1000;

/** Max restart attempts before giving up */
export const MAX_RESTART_ATTEMPTS = 5;

/** Restart backoff base: 2 seconds, doubles each attempt */
export const RESTART_BACKOFF_BASE_MS = 2000;

/** Debounce window for duplicate messages */
export const DEBOUNCE_WINDOW_MS = 1000;

/** Max concurrent sub-agents */
export const MAX_CONCURRENT_AGENTS = 5;

/** Sub-agent execution timeout: 5 minutes */
export const AGENT_TIMEOUT_MS = 5 * 60 * 1000;
