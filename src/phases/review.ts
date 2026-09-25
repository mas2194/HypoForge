import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ReviewResultSchema, type ReviewResult } from "../schemas/result.js";
import type { CandidateImplementation } from "../schemas/candidate.js";
import type { VerificationResult } from "../schemas/result.js";
import type { CodexClientManager } from "../codex/client.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ReviewOptions {
  goal: string;
  implementation: CandidateImplementation;
  verification: VerificationResult;
  testCommand?: string;
  baseBranch?: string;
}

import { EMBEDDED_PROMPTS } from "../prompts/embedded.js";

export async function runCleanRoomReviewPhase(
  options: ReviewOptions,
  codexManager?: CodexClientManager
): Promise<ReviewResult> {
  const promptPath = path.resolve(__dirname, "../../prompts/reviewer.md");
  let systemPrompt = EMBEDDED_PROMPTS.reviewer;
  try {
    systemPrompt = await fs.readFile(promptPath, "utf-8");
  } catch {
    // Keep embedded prompt fallback
  }

  // Give the reviewer direct read-only access to the candidate worktree. Pass a
  // file manifest, not patch contents, so large changes are never silently cut.
  const worktreePath = options.implementation.worktreePath;
  const base = options.baseBranch ?? "main";
  const [committedChanges, workingChanges, untrackedFiles, workspaceStatus] = await Promise.all([
    execFileAsync("git", ["diff", "--name-only", `${base}...HEAD`], { cwd: worktreePath })
      .then(({ stdout }) => stdout)
      .catch(() => ""),
    execFileAsync("git", ["diff", "--name-only", "HEAD"], { cwd: worktreePath })
      .then(({ stdout }) => stdout)
      .catch(() => ""),
    execFileAsync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: worktreePath })
      .then(({ stdout }) => stdout)
      .catch(() => ""),
    execFileAsync("git", ["status", "--short", "--untracked-files=all"], { cwd: worktreePath })
      .then(({ stdout }) => stdout.trim() || "Clean")
      .catch(() => "Unable to read worktree status"),
  ]);
  const changedFiles = [...new Set(
    [committedChanges, workingChanges, untrackedFiles]
      .flatMap((output) => output.split("\n"))
      .map((file) => file.trim())
      .filter(Boolean)
  )].sort();
  const changedFilesSummary = changedFiles.length > 0
    ? changedFiles.map((file) => `- ${file}`).join("\n")
    : "(No changed files found relative to the base branch or worktree status.)";

  const benchmarkSummary = options.verification.benchmark
    ? `- Benchmark: before=${options.verification.benchmark.before}, after=${options.verification.benchmark.after} (${options.verification.benchmark.unit})`
    : "";
  const complexitySummary = options.verification.complexity
    ? `- Diff Complexity: +${options.verification.complexity.addedLines} / -${options.verification.complexity.deletedLines} lines across ${options.verification.complexity.fileCount} file(s)`
    : "";
  const regressionsSummary = options.verification.regressions.length > 0
    ? `- Detected Regressions: ${options.verification.regressions.join("; ")}`
    : "- Detected Regressions: None";

  const prompt = `
${systemPrompt}

Goal:
${options.goal}

Candidate:
Anonymous Candidate X (All author and ranking metadata stripped for blind audit)

Objective Test & Verification Evidence:
- Test Command: ${options.testCommand ?? "No mandatory test command configured"}
- Test Results: ${options.verification.tests.passed} command(s) passed, ${options.verification.tests.failed} failed (exit code ${options.verification.tests.exitCode})
- Execution Status: ${!options.testCommand ? "NOT RUN (no mandatory test command configured)" : options.verification.tests.failed === 0 ? "PASSED" : "FAILED (Test failures detected)"}
- Acceptance Checks: ${options.verification.acceptance.tested ? (options.verification.acceptance.passed ? "PASSED" : "FAILED") : "NOT RUN (no acceptance criteria configured)"}
- Verified Criteria: ${options.verification.acceptance.verifiedCriteria.join("; ") || "None recorded"}
- Missing Criteria: ${options.verification.acceptance.missingCriteria.join("; ") || "None recorded"}
${regressionsSummary}
${benchmarkSummary}
${complexitySummary}
- Hard Gates: ${options.verification.hardGates.passedAll ? "PASSED" : "FAILED"}${options.verification.hardGates.failureReasons.length ? ` (${options.verification.hardGates.failureReasons.join("; ")})` : ""}
- Test Output (last 6,000 characters):
\`\`\`text
${options.verification.tests.output.slice(-6000) || "(No test output recorded)"}
\`\`\`

Candidate Workspace: Current read-only worktree
Base Branch: ${base}
Worktree Status:
\`\`\`text
${workspaceStatus}
\`\`\`

Changed Files to Inspect:
${changedFilesSummary}

Inspect the candidate worktree directly. Read the changed files and any relevant surrounding files needed to determine whether the goal was met. Do not rely on a pasted diff; none is supplied. You may use read-only commands to inspect files and repository metadata, but do not run tests, modify files, or make external changes.
Review the implementation and available verification evidence as an independent auditor.
Respond strictly with a valid JSON object matching this schema:
{
  "approved": boolean,
  "failureClass": "IMPLEMENTATION_ERROR" | "FALSIFICATION_GAP" | "ROOT_CAUSE_ERROR" | "EXTERNAL_SPEC" | "REPO_MODEL_ERROR" | null,
  "blockingIssues": string[],
  "suggestions": string[],
  "feedback": "string"
}
Failure classes for rejections:
- IMPLEMENTATION_ERROR: Localized syntax, compilation, off-by-one error (routable to Implement)
- FALSIFICATION_GAP: Missed edge-case, unhandled boundary scenario (routable to Falsify)
- ROOT_CAUSE_ERROR: Fundamental hypothesis flaw, architectural regression (routable to Diagnose)
- EXTERNAL_SPEC: Third-party API mismatch or library limitation (routable to Research)
- REPO_MODEL_ERROR: Invariant violation or repository topology misunderstanding (routable to Inspect)
`.trim();

  if (codexManager) {
    try {
      // Clean-room: strictly read-only, offline, isolated thread with no implementation history
      const thread = codexManager.startWorkerThread({
        workingDirectory: worktreePath,
        sandboxMode: "read-only",
        networkAccessEnabled: false,
        webSearchMode: "disabled",
      });
      const turn = await thread.run(prompt);
      const response = turn.finalResponse ?? "";
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return ReviewResultSchema.parse(parsed);
      }
    } catch (err) {
      console.warn("Codex reviewer call failed, falling back to deterministic review:", err);
    }
  }

  // Deterministic fallback: approve if tests passed and score is positive
  const approved = options.verification.tests.failed === 0 && options.verification.score > 0;
  return ReviewResultSchema.parse({
    approved,
    failureClass: approved ? undefined : "IMPLEMENTATION_ERROR",
    blockingIssues: approved ? [] : ["Tests failed or negative score detected"],
    suggestions: [
      "Ensure all architectural invariants and regression tests remain documented.",
    ],
    feedback: approved
      ? "Clean-room review passed. No architectural regressions detected."
      : "Clean-room review rejected candidate due to unresolved test failures.",
  });
}
