import fs from "node:fs/promises";
import path from "node:path";

export interface DurableMemoryOptions {
  repoRoot?: string;
}

export class DurableMemoryManager {
  readonly repoRoot: string;
  readonly baseDir: string;

  constructor(options: DurableMemoryOptions = {}) {
    this.repoRoot = path.resolve(options.repoRoot ?? process.cwd());
    this.baseDir = path.resolve(this.repoRoot, ".agent");
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

  async recordDecisionRecord(
    title: string,
    context: string,
    decision: string,
    consequences: string
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
    return filename;
  }
}
