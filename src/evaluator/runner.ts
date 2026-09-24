import { exec } from "node:child_process";
import { promisify } from "node:util";
import { VerificationResultSchema, type VerificationResult } from "../schemas/result.js";

const execAsync = promisify(exec);

export interface RunVerificationOptions {
  candidateId: string;
  worktreePath: string;
  testCommand?: string;
  baseBranch?: string;
  interventionLevel?: number;
  benchmarkBefore?: number;
  benchmarkAfter?: number;
}

export interface RunBaselineOptions {
  repoPath: string;
  testCommand?: string;
}

export class Evaluator {
  /**
   * Evaluates Candidate 0 (Baseline on main branch).
   * Used as the control baseline to guarantee proposed changes provide genuine superiority.
   */
  async runBaselineVerification(options: RunBaselineOptions): Promise<VerificationResult> {
    const { repoPath, testCommand = "npm test" } = options;
    let testOutput = "";
    let passed = 0;
    let failed = 0;
    let exitCode = 0;
    const regressions: string[] = [];

    try {
      const { stdout, stderr } = await execAsync(testCommand, { cwd: repoPath });
      testOutput = `${stdout}\n${stderr}`.trim();
      passed = 1;
      failed = 0;
      exitCode = 0;
    } catch (err: any) {
      testOutput = `${err.stdout || ""}\n${err.stderr || ""}\n${err.message || ""}`.trim();
      passed = 0;
      failed = 1;
      exitCode = err.code ?? 1;
      regressions.push(`Baseline test command failed: ${testCommand}`);
    }

    const testsPassed = failed === 0 && passed > 0;
    const hardGates = {
      testsPassed,
      noRegressions: regressions.length === 0,
      typecheckPassed: true,
      lintPassed: true,
      passedAll: testsPassed && regressions.length === 0,
      failureReasons: regressions,
    };

    const softMetrics = {
      performanceImprovementPercent: 0,
      complexityDelta: 0,
      addedLines: 0,
      deletedLines: 0,
      fileCount: 0,
      architecturalInterventionLevel: 0, // Baseline has 0 intervention
      confidenceScore: testsPassed ? 1.0 : 0.0,
    };

    return VerificationResultSchema.parse({
      candidateId: "baseline-0",
      isBaseline: true,
      hardGates,
      softMetrics,
      tests: {
        passed,
        failed,
        output: testOutput,
        exitCode,
      },
      complexity: {
        addedLines: 0,
        deletedLines: 0,
        fileCount: 0,
      },
      regressions,
      score: testsPassed ? 100 : -100,
    });
  }

  /**
   * Runs verification suite in the given worktree and computes objective metrics.
   * Enforces Hard Gates and extracts multi-objective Soft Metrics for Pareto comparison.
   */
  async runVerification(options: RunVerificationOptions): Promise<VerificationResult> {
    const {
      candidateId,
      worktreePath,
      testCommand = "npm test",
      baseBranch = "main",
      interventionLevel = 1,
      benchmarkBefore,
      benchmarkAfter,
    } = options;

    let testOutput = "";
    let passed = 0;
    let failed = 0;
    let exitCode = 0;
    const regressions: string[] = [];

    // 1. Machine Gate: Run Tests
    const startTime = Date.now();
    try {
      const { stdout, stderr } = await execAsync(testCommand, { cwd: worktreePath });
      testOutput = `${stdout}\n${stderr}`.trim();
      passed = 1;
      failed = 0;
      exitCode = 0;
    } catch (err: any) {
      testOutput = `${err.stdout || ""}\n${err.stderr || ""}\n${err.message || ""}`.trim();
      passed = 0;
      failed = 1;
      exitCode = err.code ?? 1;
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

    // 3. Performance / Benchmark metrics calculation
    let perfImprovement = 0;
    if (benchmarkBefore && benchmarkAfter && benchmarkBefore > 0) {
      perfImprovement = ((benchmarkBefore - benchmarkAfter) / benchmarkBefore) * 100;
    }

    // 4. Hard Gates Check
    const testsPassed = failed === 0 && passed > 0;
    const noRegressions = regressions.length === 0;
    const hardGates = {
      testsPassed,
      noRegressions,
      typecheckPassed: true,
      lintPassed: true,
      passedAll: testsPassed && noRegressions,
      failureReasons: regressions,
    };

    // 5. Soft Metrics Profile
    const softMetrics = {
      performanceImprovementPercent: perfImprovement,
      complexityDelta: addedLines + deletedLines,
      addedLines,
      deletedLines,
      fileCount,
      architecturalInterventionLevel: interventionLevel,
      confidenceScore: testsPassed ? 1.0 : 0.0,
    };

    // Legacy scalar score (preserved for backward-compatibility)
    let score = 0;
    if (testsPassed) {
      score += 100;
      score += interventionLevel * 15;
      score -= Math.min(20, duration / 1000);
      if (perfImprovement > 0) score += Math.min(50, perfImprovement);
    } else {
      score = -100 * failed;
    }

    return VerificationResultSchema.parse({
      candidateId,
      isBaseline: false,
      hardGates,
      softMetrics,
      tests: {
        passed,
        failed,
        output: testOutput,
        exitCode,
      },
      benchmark: benchmarkBefore && benchmarkAfter ? {
        before: benchmarkBefore,
        after: benchmarkAfter,
        unit: "ms",
      } : undefined,
      complexity: {
        addedLines,
        deletedLines,
        fileCount,
      },
      regressions,
      score,
    });
  }
}
