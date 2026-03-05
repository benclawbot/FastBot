/**
 * Query Memory Data (QMD) - Vector search for chatbot memory
 * Allows the chatbot to search across agent files, chat history, memories, and codebase
 */
import { readdirSync, readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createChildLogger } from "../logger/index.js";
import type { SQLiteDB } from "../memory/sqlite.js";
import type { VectorStore } from "../memory/vectors.js";

const log = createChildLogger("qmd");

export interface QmdSearchResult {
  source: "agent_file" | "chat_history" | "memory" | "codebase";
  id: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

interface CodeChunk {
  id: string;
  file: string;
  name: string;
  type: string;
  content: string;
  line: number;
}

/**
 * QMD - Query Memory Data
 * Provides semantic search across all stored data including codebase
 */
export class QmdStore {
  private vectorStore: VectorStore | null = null;
  private agentsDir: string;
  private db: SQLiteDB;
  private codebaseIndexed = false;
  private codebaseIndexPath: string;

  constructor(db: SQLiteDB, vectorStore: VectorStore | null, agentsDir: string, codebasePath?: string) {
    this.db = db;
    this.vectorStore = vectorStore;
    this.agentsDir = agentsDir;
    this.codebaseIndexPath = codebasePath || join(process.cwd(), "data", "codebase-index.json");
  }

  /**
   * Search across all sources
   */
  async search(query: string, sources: ("agent_files" | "chat_history" | "memory" | "codebase")[] = ["agent_files", "chat_history", "memory", "codebase"]): Promise<QmdSearchResult[]> {
    const results: QmdSearchResult[] = [];

    if (sources.includes("agent_files")) {
      results.push(...await this.searchAgentFiles(query));
    }

    if (sources.includes("chat_history") && this.vectorStore) {
      results.push(...await this.searchChatHistory(query));
    }

    if (sources.includes("memory") && this.vectorStore) {
      results.push(...await this.searchMemory(query));
    }

    if (sources.includes("codebase")) {
      results.push(...await this.searchCodebase(query));
    }

    // Sort by score
    return results.sort((a, b) => b.score - a.score).slice(0, 10);
  }

  /**
   * Check if codebase is indexed
   */
  isCodebaseIndexed(): boolean {
    return this.codebaseIndexed;
  }

  /**
   * Index the codebase for search
   */
  async indexCodebase(rootDir: string): Promise<{ success: boolean; chunksIndexed: number; error?: string }> {
    const codeChunks: CodeChunk[] = [];

    // Find all TypeScript files
    const tsFiles = this.findTypeScriptFiles(rootDir);

    for (const file of tsFiles) {
      try {
        const content = readFileSync(file, "utf-8");
        const chunks = this.chunkCode(content, file);
        codeChunks.push(...chunks);
      } catch (err) {
        log.warn({ file, err }, "Failed to read file");
      }
    }

    // Save the index
    const dataDir = join(process.cwd(), "data");
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    const indexData = {
      indexedAt: Date.now(),
      rootDir,
      files: tsFiles.length,
      chunks: codeChunks.length,
      data: codeChunks,
    };

    try {
      writeFileSync(this.codebaseIndexPath, JSON.stringify(indexData, null, 2));
      this.codebaseIndexed = true;
      log.info({ files: tsFiles.length, chunks: codeChunks.length }, "Codebase indexed");
      return { success: true, chunksIndexed: codeChunks.length };
    } catch (err) {
      log.error({ err }, "Failed to save codebase index");
      return { success: false, chunksIndexed: 0, error: String(err) };
    }
  }

  /**
   * Find all TypeScript files in the project
   */
  private findTypeScriptFiles(rootDir: string): string[] {
    const files: string[] = [];

    // Common source directories to index
    const sourceDirs = ["packages/gateway/src", "packages/dashboard/src", "packages/playwright/src"];

    for (const dir of sourceDirs) {
      const fullPath = join(rootDir, dir);
      if (existsSync(fullPath)) {
        this.walkDir(fullPath, files, [".ts", ".tsx"]);
      }
    }

    return files;
  }

  /**
   * Walk directory and collect files
   */
  private walkDir(dir: string, files: string[], extensions: string[]): void {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          // Skip node_modules, .git, dist, etc.
          if (!["node_modules", ".git", "dist", ".next", "coverage"].includes(entry.name)) {
            this.walkDir(fullPath, files, extensions);
          }
        } else if (entry.isFile()) {
          const ext = entry.name.includes(".") ? "." + entry.name.split(".").pop() : "";
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (err) {
      log.warn({ dir, err }, "Failed to walk directory");
    }
  }

  /**
   * Chunk code into semantic pieces
   */
  private chunkCode(content: string, filePath: string): CodeChunk[] {
    const chunks: CodeChunk[] = [];

    // Extract exports (functions, classes, interfaces)
    const exportMatches = content.matchAll(/(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var)\s+(\w+)/g);

    for (const match of exportMatches) {
      const name = match[1]!;
      const type = match[0]!.includes("class") ? "class" :
                   match[0]!.includes("interface") || match[0]!.includes("type") ? "type" :
                   "function";

      // Find the approximate location
      const searchStart = Math.max(0, match.index! - 100);
      const searchEnd = Math.min(content.length, match.index! + 500);
      const context = content.slice(searchStart, searchEnd);

      // Create a unique ID
      const id = `${filePath}:${name}`;

      chunks.push({
        id,
        file: filePath,
        name,
        type,
        content: context.trim(),
        line: content.slice(0, match.index).split("\n").length,
      });
    }

    // If no exports found, chunk by lines
    if (chunks.length === 0) {
      const lines = content.split("\n");
      const chunkSize = 50;
      for (let i = 0; i < lines.length; i += chunkSize) {
        const chunkContent = lines.slice(i, i + chunkSize).join("\n");
        chunks.push({
          id: `${filePath}:${i}`,
          file: filePath,
          name: `lines_${i}-${i + chunkSize}`,
          type: "code",
          content: chunkContent,
          line: i + 1,
        });
      }
    }

    return chunks;
  }

  /**
   * Search codebase (keyword-based)
   */
  private async searchCodebase(query: string): Promise<QmdSearchResult[]> {
    const results: QmdSearchResult[] = [];

    if (!existsSync(this.codebaseIndexPath)) {
      return results;
    }

    try {
      const indexData = JSON.parse(readFileSync(this.codebaseIndexPath, "utf-8"));
      const queryLower = query.toLowerCase();

      for (const chunk of indexData.data as CodeChunk[]) {
        const nameMatch = chunk.name.toLowerCase().includes(queryLower);
        const contentMatch = chunk.content.toLowerCase().includes(queryLower);
        const fileMatch = chunk.file.toLowerCase().includes(queryLower);

        if (nameMatch || contentMatch || fileMatch) {
          let score = 0;
          if (nameMatch) score += 0.5;
          if (fileMatch) score += 0.3;
          const matches = (chunk.content.toLowerCase().match(new RegExp(queryLower, "g")) || []).length;
          score += Math.min(matches * 0.05, 0.4);

          results.push({
            source: "codebase",
            id: chunk.id,
            content: chunk.content.slice(0, 500),
            score: Math.min(score, 1),
            metadata: {
              file: chunk.file,
              name: chunk.name,
              type: chunk.type,
              line: chunk.line,
            },
          });
        }
      }
    } catch (err) {
      log.error({ err }, "Error searching codebase");
    }

    return results;
  }

  /**
   * Get codebase index stats
   */
  getCodebaseStats(): { indexed: boolean; files?: number; chunks?: number; indexedAt?: number } {
    if (!existsSync(this.codebaseIndexPath)) {
      return { indexed: false };
    }

    try {
      const indexData = JSON.parse(readFileSync(this.codebaseIndexPath, "utf-8"));
      this.codebaseIndexed = true;
      return {
        indexed: true,
        files: indexData.files,
        chunks: indexData.chunks,
        indexedAt: indexData.indexedAt,
      };
    } catch {
      return { indexed: false };
    }
  }

  /**
   * Search agent MD files
   */
  private async searchAgentFiles(query: string): Promise<QmdSearchResult[]> {
    const results: QmdSearchResult[] = [];
    const queryLower = query.toLowerCase();

    if (!existsSync(this.agentsDir)) {
      return results;
    }

    try {
      const agentDirs = readdirSync(this.agentsDir, { withFileTypes: true })
        .filter(dir => dir.isDirectory());

      for (const agentDir of agentDirs) {
        const agentPath = join(this.agentsDir, agentDir.name);
        const files = readdirSync(agentPath).filter(f => f.endsWith(".md"));

        for (const file of files) {
          const filePath = join(agentPath, file);
          const content = readFileSync(filePath, "utf-8");

          // Simple keyword + title matching
          const titleMatch = file.replace(".md", "").toLowerCase().includes(queryLower);
          const contentMatch = content.toLowerCase().includes(queryLower);

          if (titleMatch || contentMatch) {
            // Calculate simple score based on matches
            let score = 0;
            const title = file.replace(".md", "");
            if (title.toLowerCase().includes(queryLower)) score += 0.5;
            const matches = (content.toLowerCase().match(new RegExp(queryLower, "g")) || []).length;
            score += Math.min(matches * 0.1, 0.5);

            results.push({
              source: "agent_file",
              id: `${agentDir.name}/${file}`,
              content: content.slice(0, 500) + (content.length > 500 ? "..." : ""),
              score: Math.min(score, 1),
              metadata: {
                agent: agentDir.name,
                file,
              },
            });
          }
        }
      }
    } catch (err) {
      log.error({ err }, "Error searching agent files");
    }

    return results;
  }

  /**
   * Search chat history via vector store
   */
  private async searchChatHistory(query: string): Promise<QmdSearchResult[]> {
    if (!this.vectorStore) return [];

    try {
      const results = await this.vectorStore.search(query, 5, 0.3);
      return results.map(r => ({
        source: "chat_history" as const,
        id: String(r.id),
        content: r.content,
        score: r.score,
        metadata: r.metadata,
      }));
    } catch (err) {
      log.error({ err }, "Error searching chat history");
      return [];
    }
  }

  /**
   * Search stored memories via vector store
   */
  private async searchMemory(query: string): Promise<QmdSearchResult[]> {
    if (!this.vectorStore) return [];

    try {
      const results = await this.vectorStore.search(query, 5, 0.3);
      return results.map(r => ({
        source: "memory" as const,
        id: String(r.id),
        content: r.content,
        score: r.score,
        metadata: r.metadata,
      }));
    } catch (err) {
      log.error({ err }, "Error searching memory");
      return [];
    }
  }

  /**
   * Index chat message into vector store
   */
  async indexChatMessage(content: string, metadata: Record<string, unknown> = {}): Promise<number | null> {
    if (!this.vectorStore) return null;

    try {
      const id = await this.vectorStore.add(content, {
        ...metadata,
        type: "chat_message",
      });
      log.info({ id, contentLength: content.length }, "Indexed chat message");
      return id;
    } catch (err) {
      log.error({ err }, "Error indexing chat message");
      return null;
    }
  }

  /**
   * Index agent file content
   */
  async indexAgentFile(agentId: string, fileName: string, content: string): Promise<number | null> {
    if (!this.vectorStore) return null;

    try {
      const id = await this.vectorStore.add(content, {
        type: "agent_file",
        agentId,
        fileName,
      });
      log.info({ id, agentId, fileName }, "Indexed agent file");
      return id;
    } catch (err) {
      log.error({ err }, "Error indexing agent file");
      return null;
    }
  }
}
