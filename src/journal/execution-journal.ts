import fs from "node:fs/promises";
import path from "node:path";

export interface JournalEntry {
  runId: string;
  phaseId: string;
  attempt: number;
  repoSha?: string;
  codexThreadId?: string;
  budgetSnapshot?: {
    elapsedMs: number;
    candidatesEvaluated: number;
    testRuns: number;
  };
  status: "STARTED" | "COMPLETED" | "FAILED";
  timestamp: string;
  details?: Record<string, unknown>;
}

/**
 * Execution Journal:
 * Maintains an append-only, durable log of pipeline actions and thread checkpoints.
 * Enables crash recovery, resuming long-horizon tasks from the last committed phase,
 * and ensuring idempotency across process restarts or network interruptions.
 */
export class ExecutionJournal {
  private journalDir: string;
  private memoryEntries: Map<string, JournalEntry[]> = new Map();

  constructor(baseDir?: string) {
    this.journalDir = baseDir ?? path.resolve(process.cwd(), ".agent", "journal");
  }

  async init(): Promise<void> {
    try {
      await fs.mkdir(this.journalDir, { recursive: true });
    } catch {
      // non-fatal
    }
  }

  private getJournalFilePath(runId: string): string {
    return path.resolve(this.journalDir, `${runId}.journal.jsonl`);
  }

  async recordPhaseStart(
    runId: string,
    phaseId: string,
    attempt: number,
    snapshot?: Partial<JournalEntry>
  ): Promise<JournalEntry> {
    const entry: JournalEntry = {
      runId,
      phaseId,
      attempt,
      status: "STARTED",
      timestamp: new Date().toISOString(),
      ...snapshot,
    };
    await this.appendEntry(entry);
    return entry;
  }

  async recordPhaseComplete(
    runId: string,
    phaseId: string,
    attempt: number,
    details?: Record<string, unknown>
  ): Promise<JournalEntry> {
    const entry: JournalEntry = {
      runId,
      phaseId,
      attempt,
      status: "COMPLETED",
      timestamp: new Date().toISOString(),
      details,
    };
    await this.appendEntry(entry);
    return entry;
  }

  async recordPhaseFailure(
    runId: string,
    phaseId: string,
    attempt: number,
    error: string,
    details?: Record<string, unknown>
  ): Promise<JournalEntry> {
    const entry: JournalEntry = {
      runId,
      phaseId,
      attempt,
      status: "FAILED",
      timestamp: new Date().toISOString(),
      details: { ...details, error },
    };
    await this.appendEntry(entry);
    return entry;
  }

  private async appendEntry(entry: JournalEntry): Promise<void> {
    // In-memory cache
    if (!this.memoryEntries.has(entry.runId)) {
      this.memoryEntries.set(entry.runId, []);
    }
    this.memoryEntries.get(entry.runId)!.push(entry);

    // Persist to JSON Lines file
    try {
      await this.init();
      const filePath = this.getJournalFilePath(entry.runId);
      const line = JSON.stringify(entry) + "\n";
      await fs.appendFile(filePath, line, "utf-8");
    } catch {
      // Memory fallback in non-filesystem tests
    }
  }

  async getEntries(runId: string): Promise<JournalEntry[]> {
    if (this.memoryEntries.has(runId)) {
      return [...this.memoryEntries.get(runId)!];
    }

    try {
      const filePath = this.getJournalFilePath(runId);
      const content = await fs.readFile(filePath, "utf-8");
      const entries: JournalEntry[] = content
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      this.memoryEntries.set(runId, entries);
      return entries;
    } catch {
      return [];
    }
  }

  async getLastCommittedPhase(runId: string): Promise<JournalEntry | null> {
    const entries = await this.getEntries(runId);
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].status === "COMPLETED") {
        return entries[i];
      }
    }
    return null;
  }

  async isPhaseCompleted(runId: string, phaseId: string, attempt: number): Promise<boolean> {
    const entries = await this.getEntries(runId);
    return entries.some(
      (e) => e.phaseId === phaseId && e.attempt === attempt && e.status === "COMPLETED"
    );
  }
}
