import fs from "node:fs/promises";
import path from "node:path";
import { FtsMemoryIndex, type MemorySearchResult } from "./fts-index.js";

export interface DurableMemoryOptions {
  repoRoot?: string;
  dbPath?: string;
}

export class DurableMemoryManager {
  readonly repoRoot: string;
  readonly baseDir: string;
  readonly ftsIndex: FtsMemoryIndex;

  constructor(options: DurableMemoryOptions = {}) {
    this.repoRoot = path.resolve(options.repoRoot ?? process.cwd());
    this.baseDir = path.resolve(this.repoRoot, ".agent");
    const dbPath = options.dbPath ?? path.resolve(this.baseDir, "memory.db");
    this.ftsIndex = new FtsMemoryIndex(dbPath);
  }

  getRunDir(runId: string): string {
    return path.resolve(this.baseDir, "runs", runId);
  }

  async initRun(runId: string, objective: Record<string, any>): Promise<string> {
    const runDir = this.getRunDir(runId);
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(
      path.resolve(runDir, "objective.json"),
      JSON.stringify(objective, null, 2),
      "utf-8"
    );
    return runDir;
  }

  async saveArtifact(runId: string, filename: string, data: any): Promise<void> {
    const runDir = this.getRunDir(runId);
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(
      path.resolve(runDir, filename),
      typeof data === "string" ? data : JSON.stringify(data, null, 2),
      "utf-8"
    );
  }

  async getArtifact(runId: string, filename: string): Promise<any | null> {
    const filePath = path.resolve(this.getRunDir(runId), filename);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      try {
        return JSON.parse(content);
      } catch {
        return content;
      }
    } catch {
      return null;
    }
  }

  async recordDecisionRecord(
    title: string,
    context: string,
    decision: string,
    consequences: string,
    runId?: string
  ): Promise<string> {
    const decisionsDir = path.resolve(this.baseDir, "decisions");
    await fs.mkdir(decisionsDir, { recursive: true });

    const files = await fs.readdir(decisionsDir).catch(() => []);
    const nextIndex = files.length + 1;
    const padded = String(nextIndex).padStart(4, "0");
    const filename = `ADR-${padded}.md`;

    const content = `# ADR-${padded}: ${title}

Date: ${new Date().toISOString()}

## Context
${context}

## Decision
${decision}

## Consequences
${consequences}
`;

    await fs.writeFile(path.resolve(decisionsDir, filename), content, "utf-8");

    // Automatically index ADR into SQLite FTS5
    this.ftsIndex.insert({
      id: `adr:${filename}`,
      type: "adr",
      title: `ADR-${padded}: ${title}`,
      content: `${context}\nDecision: ${decision}\nConsequences: ${consequences}`,
      tags: "architecture adr decision",
      runId,
    });

    return filename;
  }

  recordRejectionFeedback(
    runId: string,
    candidateId: string,
    reason: string
  ): void {
    this.ftsIndex.insert({
      id: `rejection:${runId}:${candidateId}:${Date.now()}`,
      type: "rejection",
      title: `Rejection in run ${runId} (Candidate: ${candidateId})`,
      content: reason,
      tags: "rejection feedback clean-room",
      runId,
    });
  }

  searchMemories(query: string, limit: number = 5): MemorySearchResult[] {
    return this.ftsIndex.search(query, limit);
  }

  close(): void {
    this.ftsIndex.close();
  }
}
