import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { VerificationResult } from "../schemas/result.js";

const execAsync = promisify(exec);

export interface RunVerificationOptions {
  candidateId: string;
  worktreePath: string;
  testCommand?: string;
  baseBranch?: string;
  interventionLevel?: number;
}

export class Evaluator {
  /**
   * Runs verification suite in the given worktree and computes objective scores.
   */
  async runVerification(options: RunVerificationOptions): Promise<VerificationResult> {
    const {
      candidateId,
      worktreePath,
      testCommand = "npm test",
      baseBranch = "main",
      interventionLevel = 1,
    } = options;

    let testOutput = "";
    let passed = 0;
    let failed = 0;
    const regressions: string[] = [];

    // 1. Run Tests
    const startTime = Date.now();
    try {
      const { stdout, stderr } = await execAsync(testCommand, { cwd: worktreePath });
      testOutput = `${stdout}\n${stderr}`.trim();
      passed = 1;
      failed = 0;
    } catch (err: any) {
      testOutput = `${err.stdout || ""}\n${err.stderr || ""}\n${err.message || ""}`.trim();
      passed = 0;
      failed = 1;
      regressions.push(`Test command failed: ${testCommand}`);
    }
    const duration = Date.now() - startTime;

    // 2. Measure complexity & diff
    let addedLines = 0;
    let deletedLines = 0;
    let fileCount = 0;

    try {
      const { stdout: diffStat } = await execAsync(
        `git diff --numstat ${baseBranch}...HEAD`,
        { cwd: worktreePath }
      );
      const lines = diffStat.trim().split("\n").filter(Boolean);
      for (const line of lines) {
        const [add, del] = line.split(/\s+/);
        if (add !== "-") addedLines += parseInt(add, 10) || 0;
        if (del !== "-") deletedLines += parseInt(del, 10) || 0;
        fileCount += 1;
      }
    } catch {
      // diff check failure is non-fatal
    }

    // 3. Compute objective score:
    // Core philosophy: Correctness (tests) is king.
    // Higher intervention level gets architectural bonus when correct.
    // Diff size is NOT penalized directly as an objective, but failure or regressions are heavily penalized.
    let score = 0;
    if (failed === 0 && passed > 0) {
      score += 100; // Base correctness
      score += interventionLevel * 15; // Architecture bonus for higher Ladder level solutions
      score -= Math.min(20, duration / 1000); // Small execution efficiency factor
    } else {
      score = -100 * failed;
    }

    return {
      candidateId,
      tests: {
        passed,
        failed,
        output: testOutput,
      },
      complexity: {
        addedLines,
        deletedLines,
        fileCount,
      },
      regressions,
      score,
    };
  }
}
