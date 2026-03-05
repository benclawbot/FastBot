/**
 * GitHub Integration — interact with repos, issues, PRs via Octokit.
 */
import { Octokit } from "@octokit/rest";
import { createChildLogger } from "../logger/index.js";

const log = createChildLogger("integrations:github");

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: string;
  url: string;
  createdAt: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  body: string;
  state: string;
  url: string;
  merged: boolean;
  createdAt: string;
}

export interface CommitResult {
  success: boolean;
  sha?: string;
  url?: string;
  message?: string;
}

export class GitHubClient {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(token: string, owner?: string, repo?: string) {
    this.octokit = new Octokit({ auth: token });
    this.owner = owner || "";
    this.repo = repo || "";
    log.info("GitHub client initialized");
  }

  /**
   * Configure default owner/repo
   */
  configure(owner: string, repo: string): void {
    this.owner = owner;
    this.repo = repo;
  }

  /**
   * Get authenticated user info
   */
  async getAuthenticatedUser(): Promise<{ login: string; name: string }> {
    const { data } = await this.octokit.users.getAuthenticated();
    return { login: data.login, name: data.name || data.login };
  }

  /**
   * List repositories for authenticated user
   */
  async listRepos(perPage = 30): Promise<Array<{ name: string; fullName: string; url: string; stars: number }>> {
    const { data } = await this.octokit.repos.listForAuthenticatedUser({
      sort: "updated",
      per_page: perPage,
    });

    return data.map((r) => ({
      name: r.name,
      fullName: r.full_name,
      url: r.html_url,
      stars: r.stargazers_count,
    }));
  }

  /**
   * List issues
   */
  async listIssues(owner: string, repo: string, state: "open" | "closed" | "all" = "open"): Promise<GitHubIssue[]> {
    const { data } = await this.octokit.issues.listForRepo({
      owner,
      repo,
      state,
      per_page: 30,
    });

    return data.map((i) => ({
      number: i.number,
      title: i.title,
      body: i.body ?? "",
      state: i.state,
      url: i.html_url,
      createdAt: i.created_at,
    }));
  }

  /**
   * Create an issue
   */
  async createIssue(
    owner: string,
    repo: string,
    title: string,
    body: string
  ): Promise<GitHubIssue> {
    const { data } = await this.octokit.issues.create({
      owner,
      repo,
      title,
      body,
    });

    log.info({ owner, repo, issue: data.number }, "Issue created");

    return {
      number: data.number,
      title: data.title,
      body: data.body ?? "",
      state: data.state,
      url: data.html_url,
      createdAt: data.created_at,
    };
  }

  /**
   * List PRs
   */
  async listPRs(owner: string, repo: string, state: "open" | "closed" | "all" = "open"): Promise<GitHubPR[]> {
    const { data } = await this.octokit.pulls.list({
      owner,
      repo,
      state,
      per_page: 30,
    });

    return data.map((pr) => ({
      number: pr.number,
      title: pr.title,
      body: pr.body ?? "",
      state: pr.state,
      url: pr.html_url,
      merged: pr.merged_at !== null,
      createdAt: pr.created_at,
    }));
  }

  /**
   * Get file content
   */
  async getFileContent(owner: string, repo: string, path: string): Promise<string> {
    const { data } = await this.octokit.repos.getContent({
      owner,
      repo,
      path,
    });

    if ("content" in data && data.encoding === "base64") {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }

    throw new Error("Not a file or unsupported encoding");
  }

  /**
   * Get current default branch
   */
  async getDefaultBranch(owner: string, repo: string): Promise<string> {
    const { data } = await this.octokit.repos.get({ owner, repo });
    return data.default_branch;
  }

  /**
   * Get the latest commit SHA of a branch
   */
  async getBranchSha(owner: string, repo: string, branch: string): Promise<string> {
    const { data } = await this.octokit.repos.getBranch({
      owner,
      repo,
      branch,
    });
    return data.commit.sha;
  }

  /**
   * Create a commit with a file update
   */
  async createCommit(
    owner: string,
    repo: string,
    message: string,
    files: { path: string; content: string }[]
  ): Promise<CommitResult> {
    try {
      // Get the default branch
      const defaultBranch = await this.getDefaultBranch(owner, repo);

      // Get the latest commit SHA
      const baseSha = await this.getBranchSha(owner, repo, defaultBranch);

      // Create blobs for each file
      const blobs = await Promise.all(
        files.map(async (file) => {
          const { data } = await this.octokit.git.createBlob({
            owner,
            repo,
            content: Buffer.from(file.content).toString("base64"),
            encoding: "base64",
          });
          return { path: file.path, sha: data.sha };
        })
      );

      // Create tree
      const { data: tree } = await this.octokit.git.createTree({
        owner,
        repo,
        base_tree: baseSha,
        tree: blobs.map((blob) => ({
          path: blob.path,
          mode: "100644",
          type: "blob",
          sha: blob.sha,
        })),
      });

      // Create commit
      const { data: commit } = await this.octokit.git.createCommit({
        owner,
        repo,
        message,
        tree: tree.sha,
        parents: [baseSha],
      });

      // Update reference
      await this.octokit.git.updateRef({
        owner,
        repo,
        ref: `heads/${defaultBranch}`,
        sha: commit.sha,
      });

      log.info({ owner, repo, commit: commit.sha }, "Commit created");

      return {
        success: true,
        sha: commit.sha,
        url: commit.html_url,
        message: commit.message,
      };
    } catch (err) {
      log.error({ err }, "Failed to create commit");
      return { success: false, message: String(err) };
    }
  }

  /**
   * Sanitize content to remove potential secrets
   */
  sanitizeContent(content: string): string {
    // Patterns that might contain secrets
    const secretPatterns = [
      /apiKey["']?\s*[:=]\s*["'][^"']+["']/gi,
      /api_key["']?\s*[:=]\s*["'][^"']+["']/gi,
      /secret["']?\s*[:=]\s*["'][^"']+["']/gi,
      /password["']?\s*[:=]\s*["'][^"']+["']/gi,
      /token["']?\s*[:=]\s*["'][^"']+["']/gi,
      /bearer\s+[A-Za-z0-9_\-\.]+/gi,
      /ghp_[a-zA-Z0-9]{36,}/g,
      /sk-[a-zA-Z0-9]{20,}/g,
      /sk-proj-[a-zA-Z0-9_\-]{20,}/g,
    ];

    let sanitized = content;
    for (const pattern of secretPatterns) {
      sanitized = sanitized.replace(pattern, "[REDACTED]");
    }

    return sanitized;
  }
}
