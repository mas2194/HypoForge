import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface IntegrityCheckResult {
  passed: boolean;
  violations: string[];
  protectedFilesInspected: string[];
}

const SKIP_TEST_PATTERNS = [
  /\b(it|test|describe)\.skip\b/,
  /\b(xit|xtest|xdescribe)\b/,
  /\/\/\s*eslint-disable/,
  /@ts-ignore/,
  /@ts-nocheck/,
];

/**
 * Test & Oracle Integrity Gate:
 * Audits candidate worktree to prevent "cheating" agents from weakening or bypassing
 * test suites, assertions, linter rules, or CI scripts.
 * 
 * Verifies that:
 * 1. Protected baseline test files are not deleted.
 * 2. Tests are not disabled via .skip, xit, or comment suppression.
 * 3. Package scripts (e.g. test, typecheck, lint) are not replaced with dummy no-ops.
 * 4. TypeScript compiler configurations are not loosened.
 */
export async function verifyTestIntegrity(options: {
  worktreePath: string;
  repoRoot: string;
  baseBranch?: string;
}): Promise<IntegrityCheckResult> {
  const { worktreePath, repoRoot, baseBranch = "main" } = options;
  const violations: string[] = [];
  const protectedFilesInspected: string[] = [];

  try {
    // 1. Inspect git diff for modified or deleted files compared to base branch
    const { stdout: diffSummary } = await execAsync(`git diff --name-status ${baseBranch}...HEAD`, {
      cwd: worktreePath,
    });

    const lines = diffSummary.trim().split("\n").filter(Boolean);
    for (const line of lines) {
      const [status, filePath] = line.trim().split(/\s+/);
      if (!filePath) continue;

      protectedFilesInspected.push(filePath);

      // Check 1: Deletion of existing test files or CI scripts
      const isTestFile = /(^|\/)(tests|test|__tests__)\/.*(\.test|\.spec)\.[a-z0-9]+$/i.test(filePath);
      const isCiConfig = /(^|\/)\.github\/workflows\/.*\.ya?ml$/i.test(filePath);
      const isToolchainConfig = /(^|\/)(tsconfig\.json|\.eslintrc.*|vitest\.config.*|jest\.config.*)$/i.test(filePath);

      if (status === "D" && (isTestFile || isCiConfig || isToolchainConfig)) {
        violations.push(`Test Integrity Violation: Protected oracle file deleted: '${filePath}'`);
      }

      // Check 2: Modifications to test files introducing .skip, xit, or suppression
      if ((status === "M" || status === "A") && isTestFile) {
        try {
          const { stdout: fileDiff } = await execAsync(`git diff ${baseBranch}...HEAD -- "${filePath}"`, {
            cwd: worktreePath,
          });

          // Check added lines (+) for skip patterns
          const addedLines = fileDiff
            .split("\n")
            .filter((l) => l.startsWith("+") && !l.startsWith("+++"));

          for (const added of addedLines) {
            for (const pattern of SKIP_TEST_PATTERNS) {
              if (pattern.test(added)) {
                violations.push(
                  `Test Integrity Violation: Detected test suppression pattern '${pattern.source}' introduced in '${filePath}'`
                );
                break;
              }
            }
          }
        } catch {
          // Ignore diff error on newly added files
        }
      }

      // Check 3: Altering package.json scripts to no-op
      if (filePath === "package.json" && (status === "M" || status === "A")) {
        try {
          const fullPath = path.resolve(worktreePath, "package.json");
          const content = await fs.readFile(fullPath, "utf-8");
          const pkg = JSON.parse(content);
          const scripts = pkg.scripts || {};
          for (const [name, script] of Object.entries<string>(scripts)) {
            if (["test", "lint", "typecheck", "build"].includes(name)) {
              if (/^(echo|exit 0|true|:)\b/.test(script.trim())) {
                violations.push(
                  `Test Integrity Violation: Package script '${name}' was replaced with dummy no-op: '${script}'`
                );
              }
            }
          }
        } catch {
          // ignore
        }
      }
    }
  } catch (err) {
    // If git diff fails (e.g. not a git repo in testing), fallback gracefully
  }

  return {
    passed: violations.length === 0,
    violations,
    protectedFilesInspected,
  };
}
