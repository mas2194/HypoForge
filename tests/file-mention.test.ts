import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  listWorkspaceFiles,
  findAtToken,
  filterFileCandidates,
  extractFileMentions,
  loadFileContent,
  resolveFileMentions,
  getLanguageForPath,
  clearFileCache,
  MAX_FILE_SIZE_BYTES,
} from "../src/codex/file-mention.js";
import {
  executeSlashCommand,
  handleHelpCommand,
  type SlashCommandContext,
} from "../src/codex/commands.js";

describe("File Mention Subsystem", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "file-mention-test-"));
    clearFileCache();
  });

  afterEach(() => {
    clearFileCache();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("findAtToken", () => {
    it("finds @ at the start of buffer", () => {
      const token = findAtToken("@");
      expect(token).not.toBeNull();
      expect(token?.query).toBe("");
      expect(token?.start).toBe(0);
      expect(token?.end).toBe(1);
    });

    it("finds @ with a query prefix", () => {
      const token = findAtToken("@src/m");
      expect(token).not.toBeNull();
      expect(token?.query).toBe("src/m");
      expect(token?.start).toBe(0);
      expect(token?.end).toBe(6);
    });

    it("finds @ token preceded by whitespace", () => {
      const token = findAtToken("inspect @package.j");
      expect(token).not.toBeNull();
      expect(token?.query).toBe("package.j");
      expect(token?.start).toBe(8);
      expect(token?.end).toBe(18);
    });

    it("finds @ command followed by space", () => {
      const token = findAtToken("@ src/m");
      expect(token).not.toBeNull();
      expect(token?.query).toBe("src/m");
      expect(token?.start).toBe(0);
      expect(token?.end).toBe(7);
    });

    it("ignores email addresses where @ is preceded by alphanumeric characters", () => {
      expect(findAtToken("contact user@example.com")).toBeNull();
      expect(findAtToken("user@domain")).toBeNull();
      expect(findAtToken("test@123")).toBeNull();
    });

    it("ignores tokens where cursor is already past the @ mention", () => {
      expect(findAtToken("@src/main.ts and other instructions")).toBeNull();
    });

    it("returns null when no @ character is present", () => {
      expect(findAtToken("hello world")).toBeNull();
      expect(findAtToken("npm test")).toBeNull();
    });
  });

  describe("filterFileCandidates", () => {
    const sampleFiles = [
      "src/main.ts",
      "src/codex/client.ts",
      "src/codex/commands.ts",
      "src/codex/config.ts",
      "package.json",
      "AGENTS.md",
      "README.md",
      "tests/codex-commands.test.ts",
    ];

    it("returns all non-hidden files when query is empty", () => {
      const candidates = filterFileCandidates("", sampleFiles);
      expect(candidates.length).toBe(sampleFiles.length);
      expect(candidates).toContain("src/main.ts");
    });

    it("filters and ranks candidates matching query", () => {
      const candidates = filterFileCandidates("main", sampleFiles);
      expect(candidates).toEqual(["src/main.ts"]);
    });

    it("matches candidates by path prefix", () => {
      const candidates = filterFileCandidates("src/c", sampleFiles);
      expect(candidates).toContain("src/codex/client.ts");
      expect(candidates).toContain("src/codex/commands.ts");
      expect(candidates).toContain("src/codex/config.ts");
      expect(candidates).not.toContain("src/main.ts");
    });

    it("matches candidates by substring or basename", () => {
      const candidates = filterFileCandidates("command", sampleFiles);
      expect(candidates).toContain("src/codex/commands.ts");
      expect(candidates).toContain("tests/codex-commands.test.ts");
    });

    it("respects the candidate limit", () => {
      const candidates = filterFileCandidates("src", sampleFiles, 2);
      expect(candidates.length).toBe(2);
    });
  });

  describe("extractFileMentions", () => {
    it("extracts simple file paths", () => {
      const mentions = extractFileMentions("Review @src/main.ts and @package.json");
      expect(mentions.length).toBe(2);
      expect(mentions[0].filePath).toBe("src/main.ts");
      expect(mentions[1].filePath).toBe("package.json");
    });

    it("extracts command style @ prefix", () => {
      const mentions = extractFileMentions("@ src/main.ts Refactor error handling");
      expect(mentions.length).toBe(1);
      expect(mentions[0].filePath).toBe("src/main.ts");
    });

    it("extracts quoted paths with spaces", () => {
      const mentions = extractFileMentions('@"src/my file.ts" and @\'docs/guide.md\'');
      expect(mentions.length).toBe(2);
      expect(mentions[0].filePath).toBe("src/my file.ts");
      expect(mentions[1].filePath).toBe("docs/guide.md");
    });

    it("extracts line range specifications", () => {
      const mentions = extractFileMentions("Inspect @src/main.ts:10-50 and @tests/main.test.ts:25");
      expect(mentions.length).toBe(2);
      expect(mentions[0].filePath).toBe("src/main.ts");
      expect(mentions[0].startLine).toBe(10);
      expect(mentions[0].endLine).toBe(50);

      expect(mentions[1].filePath).toBe("tests/main.test.ts");
      expect(mentions[1].startLine).toBe(25);
      expect(mentions[1].endLine).toBe(25);
    });

    it("ignores emails and invalid paths", () => {
      const mentions = extractFileMentions("Send email to user@test.com and check @src/main.ts");
      expect(mentions.length).toBe(1);
      expect(mentions[0].filePath).toBe("src/main.ts");
    });

    it("deduplicates multiple mentions of the same file", () => {
      const mentions = extractFileMentions("Check @src/main.ts and again @src/main.ts");
      expect(mentions.length).toBe(1);
      expect(mentions[0].filePath).toBe("src/main.ts");
    });
  });

  describe("getLanguageForPath", () => {
    it("maps extensions to markdown code block languages", () => {
      expect(getLanguageForPath("src/main.ts")).toBe("typescript");
      expect(getLanguageForPath("index.js")).toBe("javascript");
      expect(getLanguageForPath("data.json")).toBe("json");
      expect(getLanguageForPath("README.md")).toBe("markdown");
      expect(getLanguageForPath("script.py")).toBe("python");
      expect(getLanguageForPath("deploy.sh")).toBe("bash");
      expect(getLanguageForPath("unknown.xyz")).toBe("");
    });
  });

  describe("loadFileContent", () => {
    it("loads file content from disk", async () => {
      const testFile = path.join(tempDir, "sample.ts");
      fs.writeFileSync(testFile, 'console.log("hello world");\n');

      const loaded = await loadFileContent("sample.ts", tempDir);
      expect(loaded.path).toBe("sample.ts");
      expect(loaded.content).toBe('console.log("hello world");\n');
      expect(loaded.bytes).toBeGreaterThan(0);
    });

    it("slices line ranges accurately (1-indexed)", async () => {
      const testFile = path.join(tempDir, "multiline.txt");
      fs.writeFileSync(testFile, "line1\nline2\nline3\nline4\nline5\n");

      const loaded = await loadFileContent("multiline.txt", tempDir, {
        start: 2,
        end: 4,
      });
      expect(loaded.content).toBe("line2\nline3\nline4");
      expect(loaded.startLine).toBe(2);
      expect(loaded.endLine).toBe(4);
    });

    it("throws an error when file does not exist", async () => {
      await expect(
        loadFileContent("missing.ts", tempDir)
      ).rejects.toThrow("File not found: missing.ts");
    });

    it("throws an error when target is a directory", async () => {
      const subDir = path.join(tempDir, "sub");
      fs.mkdirSync(subDir);

      await expect(
        loadFileContent("sub", tempDir)
      ).rejects.toThrow("Path is a directory, not a file: sub");
    });

    it("throws an error when file exceeds 2MB size limit", async () => {
      const bigFile = path.join(tempDir, "big.dat");
      // Create a buffer exceeding 2MB
      const bigBuffer = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1024, "a");
      fs.writeFileSync(bigFile, bigBuffer);

      await expect(
        loadFileContent("big.dat", tempDir)
      ).rejects.toThrow("File exceeds maximum allowed size (2MB)");
    });
  });

  describe("resolveFileMentions", () => {
    it("returns unchanged prompt when no mentions are found", async () => {
      const result = await resolveFileMentions("Implement feature X", tempDir);
      expect(result.originalPrompt).toBe("Implement feature X");
      expect(result.expandedPrompt).toBe("Implement feature X");
      expect(result.files.length).toBe(0);
    });

    it("resolves and appends file content as markdown", async () => {
      const file1 = path.join(tempDir, "hello.ts");
      fs.writeFileSync(file1, 'export const greeting = "hello";\n');

      const result = await resolveFileMentions(
        "Refactor error handling in @hello.ts",
        tempDir
      );

      expect(result.files.length).toBe(1);
      expect(result.files[0].path).toBe("hello.ts");
      expect(result.expandedPrompt).toContain("Refactor error handling in @hello.ts");
      expect(result.expandedPrompt).toContain("[Loaded File: hello.ts]");
      expect(result.expandedPrompt).toContain("```typescript");
      expect(result.expandedPrompt).toContain('export const greeting = "hello";');
    });

    it("generates a meaningful default objective when prompt is just the file mention", async () => {
      const file1 = path.join(tempDir, "module.ts");
      fs.writeFileSync(file1, "export function run() {}\n");

      const result = await resolveFileMentions("@module.ts", tempDir);
      expect(result.files.length).toBe(1);
      expect(result.expandedPrompt).toContain("Inspect, analyze, and explore module.ts");
      expect(result.expandedPrompt).toContain("[Loaded File: module.ts]");
    });

    it("resolves multiple files", async () => {
      fs.writeFileSync(path.join(tempDir, "a.ts"), "const a = 1;");
      fs.writeFileSync(path.join(tempDir, "b.json"), '{"b": 2}');

      const result = await resolveFileMentions(
        "Compare @a.ts with @b.json",
        tempDir
      );

      expect(result.files.length).toBe(2);
      expect(result.expandedPrompt).toContain("[Loaded File: a.ts]");
      expect(result.expandedPrompt).toContain("[Loaded File: b.json]");
    });
  });

  describe("listWorkspaceFiles", () => {
    it("lists files in workspace and caches result", async () => {
      const files = await listWorkspaceFiles(process.cwd());
      expect(files.length).toBeGreaterThan(0);
      expect(files).toContain("package.json");
      expect(files).toContain("src/main.ts");
      expect(files.some((f) => f.includes("node_modules"))).toBe(false);
      expect(files.some((f) => f.includes(".git/"))).toBe(false);

      // Verify cached read returns identical reference
      const cached = await listWorkspaceFiles(process.cwd());
      expect(cached).toBe(files);
    });

    it("falls back to directory scan when git is unavailable or in non-git directory", async () => {
      fs.writeFileSync(path.join(tempDir, "test.txt"), "hello");
      fs.mkdirSync(path.join(tempDir, "sub"));
      fs.writeFileSync(path.join(tempDir, "sub", "sub.txt"), "world");

      const files = await listWorkspaceFiles(tempDir);
      expect(files).toContain("test.txt");
      expect(files).toContain(path.join("sub", "sub.txt"));
    });
  });

  describe("Commands Integration (@ and /help)", () => {
    const mockContext: SlashCommandContext = {
      currentModel: "gpt-6-luna",
      currentEffort: "high",
      setModel: () => {},
      setEffort: () => {},
    };

    it("handles standalone @ command with usage information", () => {
      const res = executeSlashCommand("@", mockContext);
      expect(res.handled).toBe(true);
      expect(res.output).toContain("Usage: @<file> [instruction]");
      expect(res.output).toContain("Tab to interactively browse and select");
    });

    it("handles @help command", () => {
      const res = executeSlashCommand("@help", mockContext);
      expect(res.handled).toBe(true);
      expect(res.output).toContain("Usage: @<file> [instruction]");
    });

    it("includes @file and Tab in /help output", () => {
      const helpRes = handleHelpCommand();
      expect(helpRes.output).toContain("@<file> [prompt]");
      expect(helpRes.output).toContain("Tab: autocomplete and select @file candidates");
    });
  });
});
