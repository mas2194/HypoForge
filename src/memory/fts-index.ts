import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

export type MemoryType = "adr" | "rejection" | "falsification" | "skill" | "architecture_rule" | "distilled_lesson";

export interface MemoryItem {
  id: string;
  type: MemoryType;
  title: string;
  content: string;
  tags?: string;
  runId?: string;
  createdAt?: string;
}

export interface MemorySearchResult {
  id: string;
  type: MemoryType;
  title: string;
  content: string;
  tags: string;
  runId?: string;
  createdAt: string;
  rank: number;
}

export class FtsMemoryIndex {
  private db: DatabaseSync;
  readonly dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    if (dbPath !== ":memory:") {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new DatabaseSync(this.dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memories USING fts5(
        id,
        type UNINDEXED,
        title,
        content,
        tags,
        run_id UNINDEXED,
        created_at UNINDEXED,
        tokenize = 'porter unicode61'
      );
    `);
  }

  insert(item: MemoryItem): void {
    const createdAt = item.createdAt ?? new Date().toISOString();
    const tags = item.tags ?? "";
    const runId = item.runId ?? "";

    // Delete existing entry if present to support upsert-like semantics
    const delStmt = this.db.prepare("DELETE FROM memories WHERE id = ?");
    delStmt.run(item.id);

    const insertStmt = this.db.prepare(`
      INSERT INTO memories (id, type, title, content, tags, run_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertStmt.run(item.id, item.type, item.title, item.content, tags, runId, createdAt);
  }

  search(query: string, limit: number = 5): MemorySearchResult[] {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    // Format query terms for safe FTS5 matching (prefix match per word)
    const terms = trimmed
      .replace(/[^\p{L}\p{N}\s_-]/gu, " ")
      .trim()
      .split(/\s+/)
      .filter((term) => term.length > 0)
      .map((term) => `"${term}"*`);

    if (terms.length === 0) {
      return [];
    }

    const ftsQuery = terms.join(" OR ");

    try {
      const queryStmt = this.db.prepare(`
        SELECT id, type, title, content, tags, run_id, created_at, rank
        FROM memories
        WHERE memories MATCH ?
        ORDER BY rank
        LIMIT ?
      `);

      const rows = queryStmt.all(ftsQuery, limit) as unknown as Array<{
        id: string;
        type: string;
        title: string;
        content: string;
        tags: string;
        run_id: string;
        created_at: string;
        rank: number;
      }>;

      return rows.map((r) => ({
        id: r.id,
        type: r.type as MemoryType,
        title: r.title,
        content: r.content,
        tags: r.tags,
        runId: r.run_id || undefined,
        createdAt: r.created_at,
        rank: r.rank,
      }));
    } catch (err) {
      console.warn("FTS5 query failed, falling back to empty results:", err);
      return [];
    }
  }

  getAllByType(type: MemoryType): MemorySearchResult[] {
    const stmt = this.db.prepare(`
      SELECT id, type, title, content, tags, run_id, created_at, 0 as rank
      FROM memories
      WHERE type = ?
      ORDER BY created_at DESC
    `);
    const rows = stmt.all(type) as unknown as Array<{
      id: string;
      type: string;
      title: string;
      content: string;
      tags: string;
      run_id: string;
      created_at: string;
      rank: number;
    }>;

    return rows.map((r) => ({
      id: r.id,
      type: r.type as MemoryType,
      title: r.title,
      content: r.content,
      tags: r.tags,
      runId: r.run_id || undefined,
      createdAt: r.created_at,
      rank: 0,
    }));
  }

  close(): void {
    this.db.close();
  }
}
