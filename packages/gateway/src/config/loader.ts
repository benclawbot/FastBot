import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { appConfigSchema, type AppConfig } from "./schema.js";
import { createChildLogger } from "../logger/index.js";

const log = createChildLogger("config");

const DEFAULT_CONFIG_PATH = resolve(process.cwd(), "config.json");

/**
 * Generate a random gateway port in the range 30000-65535 to avoid well-known ports.
 * This helps prevent easy discovery and targeted attacks.
 */
export function generateRandomPort(): number {
  const min = 30000;
  const max = 65535;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Load and validate config from a JSON file + environment variable overrides.
 */
export function loadConfig(
  configPath: string = DEFAULT_CONFIG_PATH
): AppConfig {
  let raw: Record<string, unknown> = {};
  let isNewConfig = false;

  if (existsSync(configPath)) {
    log.info({ path: configPath }, "Loading config from file");
    const content = readFileSync(configPath, "utf-8");
    raw = JSON.parse(content) as Record<string, unknown>;
  } else {
    log.warn({ path: configPath }, "Config file not found, using env/defaults");
    isNewConfig = true;
  }

  // Ensure server config exists
  if (!raw.server) {
    (raw as any).server = {};
  }

  // Generate random port if not specified in config or env
  if (!process.env.SCB_PORT && !((raw as any).server?.port)) {
    const randomPort = generateRandomPort();
    (raw as any).server.port = randomPort;
    log.info({ port: randomPort }, "Generated random gateway port for security");
  }

  // Environment variable overrides (highest priority)
  applyEnvOverrides(raw);

  const result = appConfigSchema.safeParse(raw);
  if (!result.success) {
    log.error({ errors: result.error.flatten() }, "Config validation failed");
    throw new Error(
      `Invalid configuration: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`
    );
  }

  // Save config if port was just generated (first run)
  if (isNewConfig || (!existsSync(configPath) && (raw as any).server?.port)) {
    saveConfigToFile(configPath, raw);
  }

  log.info("Config loaded and validated");
  return result.data;
}

/**
 * Save config back to file (e.g., after generating random port).
 */
function saveConfigToFile(configPath: string, raw: Record<string, unknown>): void {
  try {
    const dir = dirname(configPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(configPath, JSON.stringify(raw, null, 2), "utf-8");
    log.info({ path: configPath, port: (raw as any).server?.port }, "Config saved with generated port");
  } catch (err) {
    log.warn({ err, path: configPath }, "Could not save config with generated port");
  }
}

function applyEnvOverrides(raw: Record<string, unknown>): void {
  const env = process.env;

  // Telegram
  if (env.SCB_TELEGRAM_TOKEN) {
    (raw as any).telegram ??= {};
    (raw as any).telegram.botToken = env.SCB_TELEGRAM_TOKEN;
  }

  // LLM primary
  if (env.SCB_LLM_PROVIDER || env.SCB_LLM_API_KEY || env.SCB_LLM_MODEL) {
    (raw as any).llm ??= {};
    (raw as any).llm.primary ??= {};
    if (env.SCB_LLM_PROVIDER)
      (raw as any).llm.primary.provider = env.SCB_LLM_PROVIDER;
    if (env.SCB_LLM_API_KEY)
      (raw as any).llm.primary.apiKey = env.SCB_LLM_API_KEY;
    if (env.SCB_LLM_MODEL)
      (raw as any).llm.primary.model = env.SCB_LLM_MODEL;
  }

  // Server
  if (env.SCB_PORT) {
    (raw as any).server ??= {};
    (raw as any).server.port = Number(env.SCB_PORT);
  }

  // Security PIN
  if (env.SCB_PIN) {
    (raw as any).security ??= {};
    (raw as any).security.pin = env.SCB_PIN;
  }

  // GitHub
  if (env.SCB_GITHUB_TOKEN) {
    (raw as any).github = { token: env.SCB_GITHUB_TOKEN };
  }
}

/**
 * Write a config scaffold file for the onboarding wizard.
 */
export function writeConfigScaffold(configPath: string = DEFAULT_CONFIG_PATH): void {
  const randomPort = generateRandomPort();
  const scaffold = {
    server: { port: randomPort, host: "127.0.0.1" },
    telegram: { botToken: "YOUR_TELEGRAM_BOT_TOKEN", approvedUsers: [] },
    llm: {
      primary: { provider: "anthropic", apiKey: "YOUR_API_KEY", model: "claude-sonnet-4-20250514" },
      fallbacks: [],
    },
    security: { pin: "", shellAllowedPaths: ["."], binaryAllowlist: ["git", "node", "npm", "pnpm"] },
    memory: { dbPath: "data/scb.db" },
  };

  const dir = dirname(configPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(scaffold, null, 2), "utf-8");
  log.info({ path: configPath, port: randomPort }, "Config scaffold written with randomized gateway port");
}
