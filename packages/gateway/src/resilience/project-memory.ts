import { createChildLogger } from "../logger/index.js";
import * as fs from "fs/promises";
import * as path from "path";

const log = createChildLogger("project-memory");

export interface ProjectMemory {
  currentState: string;
  recentChanges: Array<{ date: string; change: string }>;
  openIssues: Array<{ issue: string; status: "open" | "in-progress" | "resolved" }>;
  decisions: Array<{ date: string; decision: string; rationale: string }>;
  contextForAI: string[];
  lastUpdated: number;
}

const DEFAULT_MEMORY: ProjectMemory = {
  currentState: "Project initialized",
  recentChanges: [],
  openIssues: [],
  decisions: [],
  contextForAI: [],
  lastUpdated: Date.now(),
};

/**
 * Load project memory from file
 */
export async function loadProjectMemory(dataDir: string): Promise<ProjectMemory> {
  const memoryPath = path.join(dataDir, "PROJECT_MEMORY.md");
  
  try {
    const content = await fs.readFile(memoryPath, "utf-8");
    const parsed = parseMemoryFromMarkdown(content);
    log.info({ path: memoryPath }, "Project memory loaded");
    return parsed;
  } catch (error) {
    log.info({ path: memoryPath }, "No existing memory, starting fresh");
    return { ...DEFAULT_MEMORY };
  }
}

/**
 * Save project memory to file
 */
export async function saveProjectMemory(dataDir: string, memory: ProjectMemory): Promise<void> {
  const memoryPath = path.join(dataDir, "PROJECT_MEMORY.md");
  memory.lastUpdated = Date.now();
  
  const content = serializeMemoryToMarkdown(memory);
  await fs.writeFile(memoryPath, content, "utf-8");
  log.info({ path: memoryPath }, "Project memory saved");
}

/**
 * Add a change to memory
 */
export function addChange(memory: ProjectMemory, change: string): void {
  memory.recentChanges.unshift({
    date: new Date().toISOString().split("T")[0],
    change,
  });
  // Keep only last 10 changes
  memory.recentChanges = memory.recentChanges.slice(0, 10);
}

/**
 * Add an issue to memory
 */
export function addIssue(memory: ProjectMemory, issue: string): void {
  memory.openIssues.push({ issue, status: "open" });
}

/**
 * Resolve an issue
 */
export function resolveIssue(memory: ProjectMemory, issue: string): void {
  const idx = memory.openIssues.findIndex((i) => i.issue === issue);
  if (idx !== -1) {
    memory.openIssues[idx].status = "resolved";
  }
}

/**
 * Add a decision to memory
 */
export function addDecision(memory: ProjectMemory, decision: string, rationale: string): void {
  memory.decisions.unshift({
    date: new Date().toISOString().split("T")[0],
    decision,
    rationale,
  });
  // Keep only last 10 decisions
  memory.decisions = memory.decisions.slice(0, 10);
}

/**
 * Add context for AI
 */
export function addContext(memory: ProjectMemory, context: string): void {
  memory.contextForAI.push(context);
  // Keep only last 20 context items
  memory.contextForAI = memory.contextForAI.slice(-20);
}

/**
 * Update current state
 */
export function updateState(memory: ProjectMemory, state: string): void {
  memory.currentState = state;
}

/**
 * Parse memory from markdown
 */
function parseMemoryFromMarkdown(content: string): ProjectMemory {
  const memory: ProjectMemory = { ...DEFAULT_MEMORY };
  
  // Simple parsing - extract sections
  const lines = content.split("\n");
  let section = "";
  
  for (const line of lines) {
    if (line.startsWith("## ")) {
      section = line.replace("## ", "").toLowerCase();
    } else if (line.startsWith("- ") && section === "current state") {
      memory.currentState = line.replace("- ", "");
    } else if (line.match(/^\d+\. /) && section === "recent changes") {
      const match = line.match(/^\d+\. \[(\d{4}-\d{2}-\d{2})\]: (.+)$/);
      if (match) {
        memory.recentChanges.push({ date: match[1], change: match[2] });
      }
    } else if (line.startsWith("- [ ]") && section === "open issues") {
      memory.openIssues.push({ issue: line.replace("- [ ]", "").trim(), status: "open" });
    } else if (line.startsWith("- [x]") && section === "open issues") {
      memory.openIssues.push({ issue: line.replace("- [x]", "").trim(), status: "resolved" });
    }
  }
  
  return memory;
}

/**
 * Serialize memory to markdown
 */
function serializeMemoryToMarkdown(memory: ProjectMemory): string {
  const lines = [
    "# Project Memory",
    "",
    "## Current State",
    `- ${memory.currentState}`,
    "",
    "## Recent Changes",
    ...memory.recentChanges.map((c, i) => `${i + 1}. [${c.date}]: ${c.change}`),
    "",
    "## Open Issues",
    ...memory.openIssues.map((i) => `- [${i.status === "resolved" ? "x" : " "}] ${i.issue}`),
    "",
    "## Decisions",
    ...memory.decisions.map((d) => `- [${d.date}]: ${d.decision} → ${d.rationale}`),
    "",
    "## Context for AI",
    ...memory.contextForAI.map((c) => `- ${c}`),
    "",
    `Last Updated: ${new Date(memory.lastUpdated).toISOString()}`,
  ];
  
  return lines.filter(Boolean).join("\n");
}

/**
 * Get context summary for AI (condensed format)
 */
export function getContextSummary(memory: ProjectMemory): string {
  const parts: string[] = [];
  
  if (memory.currentState) {
    parts.push(`State: ${memory.currentState}`);
  }
  
  if (memory.openIssues.length > 0) {
    parts.push(`Open issues: ${memory.openIssues.map((i) => i.issue).join(", ")}`);
  }
  
  if (memory.decisions.length > 0) {
    const recent = memory.decisions[0];
    parts.push(`Recent decision: ${recent.decision}`);
  }
  
  if (memory.contextForAI.length > 0) {
    parts.push(`Context: ${memory.contextForAI.slice(-3).join(" | ")}`);
  }
  
  return parts.join(" | ");
}
