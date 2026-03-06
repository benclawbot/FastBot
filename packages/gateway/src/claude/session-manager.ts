import { loadConfig } from "../config/loader.js";

interface Session {
  claudeSessionId?: string;
  workingDirectory: string;
  messages: Array<{ role: string; content: string }>;
  lastActivity: number;
}

const sessions = new Map<string, Session>();

// Lazy-load config
let cachedConfig: ReturnType<typeof loadConfig> | null = null;
function getConfig() {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

// Get workspace from config, fallback to env or cwd
function getDefaultWorkspace(): string {
  return getConfig().claude?.workspaceDir || process.env.WORKSPACE_DIR || process.cwd();
}

export function getSession(sessionKey: string): Session {
  let session = sessions.get(sessionKey);
  if (!session) {
    session = {
      workingDirectory: getDefaultWorkspace(),
      messages: [],
      lastActivity: Date.now(),
    };
    sessions.set(sessionKey, session);
  }
  session.lastActivity = Date.now();
  return session;
}

export function clearSession(sessionKey: string): void {
  sessions.delete(sessionKey);
}

export function setClaudeSessionId(sessionKey: string, id: string): void {
  const session = getSession(sessionKey);
  session.claudeSessionId = id;
}

export function getClaudeSessionId(sessionKey: string): string | undefined {
  return sessions.get(sessionKey)?.claudeSessionId;
}

// Get dangerous mode from config
export function isDangerousModeEnabled(): boolean {
  return getConfig().claude?.dangerousMode || process.env.DANGEROUS_MODE === "true" || false;
}

// Get Claude executable path from config
export function getClaudeExecutablePath(): string | undefined {
  return getConfig().claude?.executablePath || process.env.CLAUDE_EXECUTABLE_PATH;
}

// Update workspace directory
export function setWorkspace(sessionKey: string, workspace: string): void {
  const session = getSession(sessionKey);
  session.workingDirectory = workspace;
}
