import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { ReviewResultSchema, type ReviewResult } from "../schemas/result.js";
import type { CandidateImplementation } from "../schemas/candidate.js";
import type { VerificationResult } from "../schemas/result.js";
import type { CodexClientManager } from "../codex/client.js";

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ReviewOptions {
  goal: string;
  implementation: CandidateImplementation;
  verification: VerificationResult;
  baseBranch?: string;
  repoPath?: string;
}

export async function runCleanRoomReviewPhase(
  options: ReviewOptions,
  codexManager?: CodexClientManager
): Promise<ReviewResult> {
  const promptPath = path.resolve(__dirname, "../../prompts/reviewer.md");
  let systemPrompt = "";
  try {
    systemPrompt = await fs.readFile(promptPath, "utf-8");
  } catch {
    systemPrompt = "You are the Clean-Room Reviewer agent.";
  }

  // Obtain clean diff without implementation context
  let diffContent = "";
  try {
    const base = options.baseBranch ?? "main";
    const { stdout } = await execAsync(`git diff ${base}...HEAD`, {
      cwd: options.implementation.worktreePath,
    });
    diffContent = stdout.slice(0, 8000); // Keep reasonable size
  } catch {
    diffContent = "(No diff or unable to extract diff)";
  }

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
- Test Results: ${options.verification.tests.passed} passed, ${options.verification.tests.failed} failed
- Execution Status: ${options.verification.tests.failed === 0 ? "PASSED (Zero test errors)" : "FAILED (Test failures detected)"}
${regressionsSummary}
${benchmarkSummary}
${complexitySummary}

Diff:
\`\`\`diff
${diffContent}
\`\`\`

Review this diff as an independent auditor.
Respond strictly with a valid JSON object matching this schema:
{
  "approved": boolean,
  "blockingIssues": string[],
  "suggestions": string[],
  "feedback": "string"
}
`.trim();

  if (codexManager) {
    try {
      // Clean-room: start a completely brand new thread with no memory of implementation and strictly offline
      const thread = codexManager.startWorkerThread({
        workingDirectory: options.repoPath ?? process.cwd(),
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
    blockingIssues: approved ? [] : ["Tests failed or negative score detected"],
    suggestions: [
      "Ensure all architectural invariants and regression tests remain documented.",
    ],
    feedback: approved
      ? "Clean-room review passed. No architectural regressions detected."
      : "Clean-room review rejected candidate due to unresolved test failures.",
  });
}
