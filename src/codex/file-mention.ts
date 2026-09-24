import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface FileMention {
  filePath: string;
  startLine?: number;
  endLine?: number;
  raw: string;
}

export interface LoadedFile {
  path: string;
  fullPath: string;
  content: string;
  bytes: number;
  startLine?: number;
  endLine?: number;
}

export interface ResolvedPrompt {
  originalPrompt: string;
  expandedPrompt: string;
  files: LoadedFile[];
}

export interface AtToken {
  start: number;
  end: number;
  query: string;
  raw: string;
}

export const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB limit for loaded context

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  ".agent",
  ".devcontainer",
  "worktrees",
  ".next",
  "coverage",
]);

interface CacheEntry {
  timestamp: number;
  files: string[];
  repoRoot: string;
}

let workspaceFilesCache: CacheEntry | null = null;
const CACHE_TTL_MS = 5000;

/**
 * Clears the in-memory cache of workspace files.
 */
export function clearFileCache(): void {
  workspaceFilesCache = null;
}

/**
 * Recursively traverses a directory collecting relative file paths, ignoring common build/vcs folders.
 */
async function scanDirectory(dir: string, baseDir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".env.example") {
        if (IGNORED_DIRS.has(entry.name) || entry.isDirectory()) {
          continue;
        }
      }
      if (IGNORED_DIRS.has(entry.name)) {
        continue;
      }

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await scanDirectory(fullPath, baseDir);
        results.push(...subFiles);
      } else if (entry.isFile()) {
        const relPath = path.relative(baseDir, fullPath);
        results.push(relPath);
      }
    }
  } catch {
    // Ignore unreadable directories
  }
  return results;
}

/**
 * Lists workspace files using `git ls-files` with fallback to directory traversal.
 * Results are cached in memory for CACHE_TTL_MS.
 */
export async function listWorkspaceFiles(
  repoRoot: string = process.cwd(),
  useCache = true
): Promise<string[]> {
  const root = path.resolve(repoRoot);
  const now = Date.now();

  if (
    useCache &&
    workspaceFilesCache &&
    workspaceFilesCache.repoRoot === root &&
    now - workspaceFilesCache.timestamp < CACHE_TTL_MS
  ) {
    return workspaceFilesCache.files;
  }

  let files: string[] = [];

  try {
    const { stdout } = await execFileAsync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard"],
      { cwd: root }
    );
    files = stdout
      .split("\n")
      .map((f) => f.trim())
      .filter((f) => f.length > 0 && !f.startsWith(".git/"));
  } catch {
    // Fallback: directory walk
    files = await scanDirectory(root, root);
  }

  // Sort files with source files and root configs first
  files.sort((a, b) => {
    const aIsHidden = a.startsWith(".");
    const bIsHidden = b.startsWith(".");
    if (aIsHidden !== bIsHidden) return aIsHidden ? 1 : -1;
    return a.localeCompare(b);
  });

  workspaceFilesCache = {
    timestamp: now,
    files,
    repoRoot: root,
  };

  return files;
}

/**
 * Finds an active `@` mention token ending at or before `cursorPos` in `buffer`.
 * Distinguishes genuine file mentions from email addresses.
 */
export function findAtToken(
  buffer: string,
  cursorPos: number = buffer.length
): AtToken | null {
  const text = buffer.slice(0, cursorPos);

  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === "@") {
      // If preceded by an alphanumeric character, it is part of an email or identifier
      if (i > 0 && /[a-zA-Z0-9_]/.test(text[i - 1])) {
        continue;
      }

      const rawAfter = text.slice(i + 1);

      // If there is non-whitespace followed by whitespace, the token has already ended
      if (/\S\s+/.test(rawAfter)) {
        return null;
      }

      const query = rawAfter.trimStart();
      return {
        start: i,
        end: cursorPos,
        query,
        raw: text.slice(i),
      };
    }
  }

  return null;
}

/**
 * Filters and ranks candidate file paths matching a query string.
 */
export function filterFileCandidates(
  query: string,
  files: string[],
  limit: number = 20
): string[] {
  if (!query) {
    return files.filter((f) => !f.startsWith(".")).slice(0, limit);
  }

  const q = query.toLowerCase();
  const scored: Array<{ file: string; score: number; len: number }> = [];

  for (const file of files) {
    const lower = file.toLowerCase();
    const base = lower.split("/").pop() || "";

    let score = -1;
    if (lower === q) {
      score = 100; // Exact full path match
    } else if (base === q) {
      score = 90; // Exact basename match
    } else if (lower.startsWith(q)) {
      score = 80; // Path starts with query
    } else if (base.startsWith(q)) {
      score = 70; // Basename starts with query
    } else if (lower.includes("/" + q)) {
      score = 65; // Subdirectory/file starts with query
    } else if (lower.includes(q)) {
      score = 50; // Path contains query
    }

    if (score >= 0) {
      scored.push({ file, score, len: file.length });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.len - b.len || a.file.localeCompare(b.file));
  return scored.slice(0, limit).map((s) => s.file);
}

/**
 * Extracts all `@<filePath>` mentions from input text, supporting line ranges like `@path:10-50`.
 */
export function extractFileMentions(text: string): FileMention[] {
  const mentions: FileMention[] = [];
  const seen = new Set<string>();

  // 1. Check for command style at start of string: `@ src/main.ts` or `@ "path with spaces"`
  const commandPrefixRegex = /^\s*@\s+(?:"([^"]+)"|'([^']+)'|([a-zA-Z0-9_./\\-]+))(?::(\d+)(?:-(\d+))?)?/;
  const cmdMatch = commandPrefixRegex.exec(text);
  if (cmdMatch) {
    const filePath = cmdMatch[1] || cmdMatch[2] || cmdMatch[3];
    const startLine = cmdMatch[4] ? parseInt(cmdMatch[4], 10) : undefined;
    const endLine = cmdMatch[5] ? parseInt(cmdMatch[5], 10) : startLine;
    const key = `${filePath}:${startLine ?? ""}-${endLine ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      mentions.push({
        filePath,
        startLine,
        endLine,
        raw: cmdMatch[0],
      });
    }
  }

  // 2. Scan standard `@path` mentions
  const mentionRegex = /(?:^|\s)@(?:"([^"]+)"|'([^']+)'|([a-zA-Z0-9_./\\-]+))(?::(\d+)(?:-(\d+))?)?/g;
  let match: RegExpExecArray | null;
  while ((match = mentionRegex.exec(text)) !== null) {
    const filePath = match[1] || match[2] || match[3];
    // Skip if path is just an empty string
    if (!filePath || filePath.trim().length === 0) continue;

    const startLine = match[4] ? parseInt(match[4], 10) : undefined;
    const endLine = match[5] ? parseInt(match[5], 10) : startLine;
    const key = `${filePath}:${startLine ?? ""}-${endLine ?? ""}`;

    if (!seen.has(key)) {
      seen.add(key);
      mentions.push({
        filePath,
        startLine,
        endLine,
        raw: match[0].trim(),
      });
    }
  }

  return mentions;
}

/**
 * Infers markdown code block language from file path extension.
 */
export function getLanguageForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".ts":
    case ".tsx":
      return "typescript";
    case ".js":
    case ".jsx":
    case ".mjs":
    case ".cjs":
      return "javascript";
    case ".json":
      return "json";
    case ".md":
      return "markdown";
    case ".py":
      return "python";
    case ".sh":
    case ".bash":
    case ".zsh":
      return "bash";
    case ".toml":
      return "toml";
    case ".yaml":
    case ".yml":
      return "yaml";
    case ".css":
      return "css";
    case ".html":
      return "html";
    case ".sql":
      return "sql";
    case ".rs":
      return "rust";
    case ".go":
      return "go";
    case ".java":
      return "java";
    case ".c":
    case ".h":
      return "c";
    case ".cpp":
    case ".hpp":
      return "cpp";
    default:
      return "";
  }
}

/**
 * Loads file content from disk, validating file existence, type, and size limit.
 */
export async function loadFileContent(
  filePath: string,
  repoRoot: string = process.cwd(),
  lineRange?: { start?: number; end?: number }
): Promise<LoadedFile> {
  const root = path.resolve(repoRoot);
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath);
  const relPath = path.relative(root, resolved);

  let stat;
  try {
    stat = await fs.stat(resolved);
  } catch {
    throw new Error(`File not found: ${filePath}`);
  }

  if (stat.isDirectory()) {
    throw new Error(`Path is a directory, not a file: ${filePath}`);
  }

  if (stat.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File exceeds maximum allowed size (2MB): ${filePath} (${(stat.size / 1024 / 1024).toFixed(1)}MB)`
    );
  }

  let rawContent = await fs.readFile(resolved, "utf-8");

  if (lineRange && (lineRange.start !== undefined || lineRange.end !== undefined)) {
    const lines = rawContent.split("\n");
    const start = Math.max(1, lineRange.start ?? 1);
    const end = Math.min(lines.length, lineRange.end ?? lines.length);
    rawContent = lines.slice(start - 1, end).join("\n");
  }

  return {
    path: relPath || filePath,
    fullPath: resolved,
    content: rawContent,
    bytes: Buffer.byteLength(rawContent, "utf-8"),
    startLine: lineRange?.start,
    endLine: lineRange?.end,
  };
}

/**
 * Identifies all `@<file>` mentions in a prompt, reads their contents from disk,
 * and compiles an expanded prompt containing the file contents as structured markdown.
 */
export async function resolveFileMentions(
  prompt: string,
  repoRoot: string = process.cwd()
): Promise<ResolvedPrompt> {
  const trimmed = prompt.trim();
  const mentions = extractFileMentions(trimmed);

  if (mentions.length === 0) {
    return {
      originalPrompt: prompt,
      expandedPrompt: prompt,
      files: [],
    };
  }

  const loadedFiles: LoadedFile[] = [];

  for (const mention of mentions) {
    const loaded = await loadFileContent(mention.filePath, repoRoot, {
      start: mention.startLine,
      end: mention.endLine,
    });
    loadedFiles.push(loaded);
  }

  // Determine user objective: if prompt only has the file reference, create standard inspection goal
  let userInstruction = trimmed;
  // If the prompt is essentially just the mentions without other instruction
  let withoutMentions = trimmed;
  for (const m of mentions) {
    withoutMentions = withoutMentions.replace(m.raw, "").trim();
  }

  if (!withoutMentions || withoutMentions === "@") {
    userInstruction = `Inspect, analyze, and explore ${loadedFiles.map((f) => f.path).join(", ")}`;
  }

  const fileBlocks: string[] = [];
  for (const f of loadedFiles) {
    const lang = getLanguageForPath(f.path);
    const lineInfo =
      f.startLine !== undefined
        ? ` (Lines ${f.startLine}-${f.endLine ?? f.startLine})`
        : "";
    fileBlocks.push(
      `[Loaded File: ${f.path}${lineInfo}]\n\`\`\`${lang}\n${f.content}\n\`\`\``
    );
  }

  const expandedPrompt = `${userInstruction}\n\n---\n${fileBlocks.join("\n\n---\n")}`;

  return {
    originalPrompt: prompt,
    expandedPrompt,
    files: loadedFiles,
  };
}
