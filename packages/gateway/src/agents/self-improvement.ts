/**
 * Self-Improvement Scheduler
 * Runs twice daily to analyze codebase, lessons learned, and suggest improvements.
 */
import { createChildLogger } from "../logger/index.js";
import { AgentsManager } from "./manager.js";
import type { QmdStore } from "../qmd/store.js";
import type { AgentsConfig } from "../config/schema.js";
import { GitHubClient } from "../integrations/github.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const log = createChildLogger("self-improvement");

export interface ImprovementReport {
  timestamp: number;
  focus: "lessons_learned" | "codebase" | "new_features" | "general";
  findings: string[];
  suggestions: string[];
  codeReferences: { file: string; line: number; suggestion: string }[];
  githubUpdate?: {
    success: boolean;
    message?: string;
    url?: string;
  };
}

export class SelfImprovementScheduler {
  private intervalId: ReturnType<typeof setTimeout> | null = null;
  private agentsManager: AgentsManager;
  private qmdStore: QmdStore | null;
  private config: AgentsConfig;
  private projectRoot: string;
  private reportPath: string;
  private lastRun: number = 0;
  private githubClient: GitHubClient | null = null;
  private githubOwner: string = "";
  private githubRepo: string = "";

  constructor(
    agentsManager: AgentsManager,
    qmdStore: QmdStore | null,
    config: AgentsConfig,
    projectRoot?: string,
    githubToken?: string
  ) {
    this.agentsManager = agentsManager;
    this.qmdStore = qmdStore;
    this.config = config;
    this.projectRoot = projectRoot || process.cwd();
    this.reportPath = join(this.projectRoot, "data", "improvements");

    if (githubToken) {
      this.githubClient = new GitHubClient(githubToken);
    }
  }

  configureGithub(owner: string, repo: string, token: string): void {
    this.githubOwner = owner;
    this.githubRepo = repo;
    this.githubClient = new GitHubClient(token, owner, repo);
  }

  start(): void {
    if (!this.config?.enableSelfImprovement) {
      log.info("Self-improvement scheduler disabled");
      return;
    }
    this.scheduleNextRun();
    log.info("Self-improvement scheduler started");
  }

  private scheduleNextRun(): void {
    const now = new Date();
    const runTimes = this.config?.selfImprovementTimes || ["06:00", "18:00"];
    let nextRun: Date | null = null;

    for (const time of runTimes) {
      const [hours, minutes] = time.split(":").map(Number);
      const runDate = new Date(now);
      runDate.setHours(hours, minutes, 0, 0);
      if (runDate > now) {
        if (!nextRun || runDate < nextRun) {
          nextRun = runDate;
        }
      }
    }

    if (!nextRun) {
      const [hours, minutes] = runTimes[0].split(":").map(Number);
      nextRun = new Date(now);
      nextRun.setDate(nextRun.getDate() + 1);
      nextRun.setHours(hours, minutes, 0, 0);
    }

    const delay = nextRun.getTime() - now.getTime();
    log.info({ nextRun: nextRun.toISOString(), delayMs: delay }, "Next self-improvement scheduled");

    this.intervalId = setTimeout(() => {
      this.runSelfImprovement();
      this.scheduleNextRun();
    }, delay);
  }

  async runSelfImprovement(): Promise<ImprovementReport> {
    log.info("Starting self-improvement analysis...");
    const report: ImprovementReport = {
      timestamp: Date.now(),
      focus: "general",
      findings: [],
      suggestions: [],
      codeReferences: [],
    };

    const lessonsAnalysis = await this.analyzeLessonsLearned();
    report.findings.push(...lessonsAnalysis.findings);
    report.suggestions.push(...lessonsAnalysis.suggestions);

    const codebaseAnalysis = await this.analyzeCodebase();
    report.findings.push(...codebaseAnalysis.findings);
    report.suggestions.push(...codebaseAnalysis.suggestions);
    report.codeReferences.push(...codebaseAnalysis.references);

    const featureAnalysis = await this.analyzeForNewFeatures();
    report.findings.push(...featureAnalysis.findings);
    report.suggestions.push(...featureAnalysis.suggestions);

    if (this.config?.autoPushGithub && this.githubClient) {
      const githubResult = await this.pushToGithub(report);
      report.githubUpdate = githubResult;
    }

    await this.saveReport(report);

    log.info({
      findings: report.findings.length,
      suggestions: report.suggestions.length,
      githubPushed: !!report.githubUpdate?.success,
    }, "Self-improvement analysis complete");

    this.lastRun = Date.now();
    return report;
  }

  private async pushToGithub(report: ImprovementReport): Promise<{ success: boolean; message?: string; url?: string }> {
    if (!this.githubClient || !this.githubOwner || !this.githubRepo) {
      return { success: false, message: "GitHub not configured" };
    }

    try {
      const readmeUpdate = this.generateReadmeUpdate(report);
      let currentReadme = "";
      try {
        currentReadme = this.githubClient.sanitizeContent(
          await this.githubClient.getFileContent(this.githubOwner, this.githubRepo, "README.md")
        );
      } catch {
        currentReadme = "# FastBot\n\n";
      }

      let newReadme: string;
      const improvementMarker = "<!-- IMPROVEMENTS -->";
      if (currentReadme.includes(improvementMarker)) {
        const parts = currentReadme.split(improvementMarker);
        newReadme = parts[0] + improvementMarker + "\n" + readmeUpdate + "\n" + (parts[1]?.split("<!-- /IMPROVEMENTS -->")[1] || "");
      } else {
        newReadme = currentReadme + "\n" + improvementMarker + "\n" + readmeUpdate + "\n<!-- /IMPROVEMENTS -->\n";
      }

      const date = new Date().toISOString().split("T")[0];
      const result = await this.githubClient.createCommit(
        this.githubOwner,
        this.githubRepo,
        `🤖 Auto-improvement: ${report.findings.length} findings (${date})`,
        [{ path: "README.md", content: newReadme }]
      );

      if (result.success) {
        log.info({ url: result.url }, "Pushed improvements to GitHub");
        return { success: true, message: "Updated README with improvements", url: result.url };
      } else {
        return { success: false, message: result.message };
      }
    } catch (err) {
      log.error({ err }, "Failed to push to GitHub");
      return { success: false, message: String(err) };
    }
  }

  private generateReadmeUpdate(report: ImprovementReport): string {
    const lines: string[] = [];
    const date = new Date(report.timestamp).toLocaleDateString();
    lines.push(`## 🤖 Self-Improvements (${date})`);
    lines.push("");

    if (report.findings.length > 0) {
      lines.push("### Findings");
      for (const finding of report.findings.slice(0, 5)) {
        lines.push(`- ${finding}`);
      }
      lines.push("");
    }

    if (report.suggestions.length > 0) {
      lines.push("### Suggestions");
      for (const suggestion of report.suggestions.slice(0, 5)) {
        lines.push(`- ${suggestion}`);
      }
      lines.push("");
    }

    if (report.codeReferences.length > 0) {
      lines.push("### Code Improvements");
      for (const ref of report.codeReferences.slice(0, 5)) {
        lines.push(`- \`${ref.file}:${ref.line}\`: ${ref.suggestion}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  private async analyzeLessonsLearned(): Promise<{ findings: string[]; suggestions: string[] }> {
    const findings: string[] = [];
    const suggestions: string[] = [];
    const agents = this.agentsManager.listAgents();

    for (const agent of agents) {
      const lessonsFile = this.agentsManager.readAgentFile(agent.id, "lessons_learned.md");
      const memoriesFile = this.agentsManager.readAgentFile(agent.id, "memories.md");

      if (lessonsFile) {
        const rootCauses = lessonsFile.match(/## Root Cause[\s\S]*?(?=##|$)/g) || [];
        if (rootCauses.length > 3) {
          findings.push(`${agent.name}: ${rootCauses.length} root causes identified over time`);
          suggestions.push(`Consider addressing recurring pattern in ${agent.name}'s lessons`);
        }
        if (lessonsFile.toLowerCase().includes("security") || lessonsFile.toLowerCase().includes("vulnerab")) {
          findings.push(`${agent.name}: Security-related lessons learned`);
          suggestions.push("Review security patterns in codebase for improvements");
        }
      }

      if (memoriesFile) {
        const warnings = memoriesFile.match(/## Warnings\s*([\s\S]*?)(?=##|$)/g) || [];
        if (warnings.length > 0) {
          findings.push(`${agent.name}: ${warnings.length} unresolved warnings in memories`);
          suggestions.push(`Review and address warnings for ${agent.name}`);
        }
      }
    }

    return { findings, suggestions };
  }

  private async analyzeCodebase(): Promise<{
    findings: string[];
    suggestions: string[];
    references: { file: string; line: number; suggestion: string }[];
  }> {
    const findings: string[] = [];
    const suggestions: string[] = [];
    const references: { file: string; line: number; suggestion: string }[] = [];

    if (!this.qmdStore?.isCodebaseIndexed()) {
      findings.push("Codebase not indexed - running indexing...");
      await this.qmdStore?.indexCodebase(this.projectRoot);
    }

    const antiPatterns = [
      { pattern: "TODO", suggestion: "Address TODO comments in code" },
      { pattern: "FIXME", suggestion: "Review FIXME comments for bugs" },
      { pattern: "console\\.log", suggestion: "Remove debug console.log statements" },
    ];

    const sourceDirs = ["packages/gateway/src", "packages/dashboard/src", "packages/playwright/src"];

    for (const dir of sourceDirs) {
      const fullPath = join(this.projectRoot, dir);
      if (!existsSync(fullPath)) continue;

      const files = this.findFiles(fullPath, [".ts", ".tsx"]);
      for (const file of files) {
        try {
          const content = readFileSync(file, "utf-8");
          const lines = content.split("\n");

          for (const { pattern, suggestion } of antiPatterns) {
            const matches = content.match(new RegExp(pattern, "gi"));
            if (matches && matches.length > 0) {
              const lineNum = lines.findIndex((l) => new RegExp(pattern, "i").test(l));
              if (lineNum >= 0) {
                references.push({
                  file: file.replace(this.projectRoot, ""),
                  line: lineNum + 1,
                  suggestion,
                });
              }
            }
          }
        } catch {
          // Skip unreadable files
        }
      }
    }

    if (references.length > 0) {
      findings.push(`Found ${references.length} code improvement opportunities`);
      suggestions.push("Review and address code quality issues");
    }

    return { findings, suggestions, references };
  }

  private async analyzeForNewFeatures(): Promise<{ findings: string[]; suggestions: string[] }> {
    const findings: string[] = [];
    const suggestions: string[] = [];

    const skillsDir = join(this.projectRoot, "data", "skills");
    if (existsSync(skillsDir)) {
      const skills = readdirSync(skillsDir).filter((f) =>
        statSync(join(skillsDir, f)).isDirectory()
      );
      findings.push(`Installed skills: ${skills.join(", ") || "none"}`);

      const commonIntegrations = ["notion", "obsidian", "slack", "discord"];
      for (const integration of commonIntegrations) {
        if (!skills.includes(integration)) {
          suggestions.push(`Consider adding ${integration} integration skill`);
        }
      }
    }

    if (this.qmdStore) {
      const stats = this.qmdStore.getCodebaseStats();
      if (stats.indexed) {
        findings.push(`Codebase indexed: ${stats.files} files, ${stats.chunks} chunks`);
      }
    }

    return { findings, suggestions };
  }

  private async saveReport(report: ImprovementReport): Promise<void> {
    if (!existsSync(this.reportPath)) {
      mkdirSync(this.reportPath, { recursive: true });
    }

    const filename = join(this.reportPath, `report-${new Date().toISOString().split("T")[0]}.json`);
    writeFileSync(filename, JSON.stringify(report, null, 2));

    const latestPath = join(this.reportPath, "latest.json");
    writeFileSync(latestPath, JSON.stringify(report, null, 2));

    log.info({ path: filename }, "Improvement report saved");
  }

  getLatestReport(): ImprovementReport | null {
    const latestPath = join(this.reportPath, "latest.json");
    if (!existsSync(latestPath)) {
      return null;
    }
    try {
      return JSON.parse(readFileSync(latestPath, "utf-8"));
    } catch {
      return null;
    }
  }

  async trigger(): Promise<ImprovementReport> {
    return this.runSelfImprovement();
  }

  stop(): void {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
      log.info("Self-improvement scheduler stopped");
    }
  }

  private findFiles(dir: string, extensions: string[]): string[] {
    const files: string[] = [];
    if (!existsSync(dir)) return files;

    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory() && !["node_modules", ".git", "dist", ".next"].includes(entry.name)) {
          files.push(...this.findFiles(fullPath, extensions));
        } else if (entry.isFile()) {
          const ext = entry.name.includes(".") ? "." + entry.name.split(".").pop() : "";
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // Skip unreadable directories
    }

    return files;
  }
}
