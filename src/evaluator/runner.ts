import crypto from "node:crypto";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { VerificationResultSchema, type VerificationResult, type DiagnosticItem } from "../schemas/result.js";
import { verifyTestIntegrity } from "./integrity.js";
import {
  FourTierVerificationRunner,
  type AcceptanceCriterion,
  type AdversarialScenario,
  type MetamorphicTestProperty,
} from "./oracle.js";

const execAsync = promisify(exec);

export interface RunVerificationOptions {
  candidateId: string;
  worktreePath: string;
  testCommand?: string;
  baseBranch?: string;
  interventionLevel?: number;
  benchmarkBefore?: number;
  benchmarkAfter?: number;
  acceptanceCriteria?: AcceptanceCriterion[];
  adversarialScenarios?: AdversarialScenario[];
  metamorphicProperties?: MetamorphicTestProperty<any, any>[];
  metamorphicSubject?: any;
}

export interface RunBaselineOptions {
  repoPath: string;
  testCommand?: string;
}

function hashDiagnostic(filePath: string, code: string, message: string): string {
  return crypto.createHash("sha256").update(`${filePath}:${code}:${message}`).digest("hex").slice(0, 16);
}

export function extractDiagnostics(output: string): {
  typeErrors: DiagnosticItem[];
  lintErrors: DiagnosticItem[];
} {
  const typeErrors: DiagnosticItem[] = [];
  const lintErrors: DiagnosticItem[] = [];
  const lines = output.split("\n");

  for (const line of lines) {
    // TypeScript pattern: path/to/file.ts(10,5): error TS2345: Message
    // or path/to/file.ts:10:5 - error TS2345: Message
    const tsMatch = line.match(/^([^(:\s]+)(?:(?:\((\d+),(\d+)\))|(?::(\d+):(\d+)))?:\s*(?:-\s*)?error\s+(TS\d+):\s*(.+)$/i);
    if (tsMatch) {
      const filePath = tsMatch[1].trim();
      const lineNum = parseInt(tsMatch[2] || tsMatch[4] || "0", 10);
      const colNum = parseInt(tsMatch[3] || tsMatch[5] || "0", 10);
      const code = tsMatch[6].trim();
      const message = tsMatch[7].trim();
      typeErrors.push({
        filePath,
        line: lineNum || undefined,
        column: colNum || undefined,
        code,
        message,
        identityHash: hashDiagnostic(filePath, code, message),
      });
      continue;
    }

    // ESLint / Linter pattern: path/to/file.js:10:5: error: Message [rule-name]
    const lintMatch = line.match(/^([^(:\s]+):(\d+):(\d+):\s*(?:error|warning)\s*:\s*(.+?)(?:\s*\[([^\]]+)\])?$/i);
    if (lintMatch) {
      const filePath = lintMatch[1].trim();
      const lineNum = parseInt(lintMatch[2], 10);
      const colNum = parseInt(lintMatch[3], 10);
      const message = lintMatch[4].trim();
      const code = (lintMatch[5] || "lint-rule").trim();
      lintErrors.push({
        filePath,
        line: lineNum,
        column: colNum,
        code,
        message,
        identityHash: hashDiagnostic(filePath, code, message),
      });
    }
  }

  return { typeErrors, lintErrors };
}

function extractFailingTestIds(output: string): string[] {
  const ids: string[] = [];
  const lines = output.split("\n");
  for (const line of lines) {
    // Matches patterns like "FAIL tests/foo.test.ts > test_name" or "✕ should do something"
    const vitestMatch = line.match(/(?:FAIL|✕)\s+([^\n\r]+)/i);
    if (vitestMatch && vitestMatch[1]) {
      ids.push(vitestMatch[1].trim());
    }
  }
  return ids;
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

    const failingTestIds = extractFailingTestIds(testOutput);
    const diagnostics = extractDiagnostics(testOutput);
    const testsPassed = failed === 0 && passed > 0;
    const hardGates = {
      testsPassed,
      noRegressions: regressions.length === 0,
      typecheckPassed: diagnostics.typeErrors.length === 0,
      lintPassed: diagnostics.lintErrors.length === 0,
      testIntegrityPassed: true,
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
        failingTestIds,
        passingTestIds: passed > 0 ? ["baseline-suite-passed"] : [],
      },
      diagnostics,
      metamorphic: {
        tested: false,
        passed: true,
        properties: {},
        failureReasons: [],
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

    // 3.5 Test & Oracle Integrity Gate (Anti-Cheating Check)
    const integrityResult = await verifyTestIntegrity({
      worktreePath,
      repoRoot: worktreePath,
      baseBranch,
    });
    if (!integrityResult.passed) {
      regressions.push(...integrityResult.violations);
    }

    // 3.6 Four-Tier Independent Verification Oracle Evaluation
    const fourTierRunner = new FourTierVerificationRunner();

    // Tier 2: Acceptance Oracle
    const acceptance = await fourTierRunner.evaluateAcceptance(
      options.acceptanceCriteria ?? [],
      { worktreePath, testOutput }
    );
    if (!acceptance.passed) {
      regressions.push(...acceptance.missingCriteria.map((m) => `Acceptance criterion missing: ${m}`));
    }

    // Tier 3: Hidden Adversarial Scenarios
    const adversarial = await fourTierRunner.evaluateAdversarial(
      options.adversarialScenarios ?? [],
      { worktreePath }
    );
    if (!adversarial.passed) {
      regressions.push(...adversarial.failureReasons);
    }

    // Tier 4: Metamorphic & Invariant Properties
    const metamorphic = options.metamorphicProperties && options.metamorphicProperties.length > 0
      ? await fourTierRunner.evaluateMetamorphic(options.metamorphicSubject, options.metamorphicProperties)
      : {
          tested: false,
          passed: true,
          properties: {},
          failureReasons: [],
        };
    if (metamorphic.tested && !metamorphic.passed) {
      regressions.push(...metamorphic.failureReasons);
    }

    // 4. Hard Gates Check
    const diagnostics = extractDiagnostics(testOutput);
    const testsPassed = failed === 0 && passed > 0;
    const noRegressions = regressions.length === 0;
    const testIntegrityPassed = integrityResult.passed;
    const typecheckPassed = diagnostics.typeErrors.length === 0;
    const lintPassed = diagnostics.lintErrors.length === 0;
    const hardGates = {
      testsPassed,
      noRegressions,
      typecheckPassed,
      lintPassed,
      testIntegrityPassed,
      passedAll: testsPassed && noRegressions && testIntegrityPassed,
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

    const failingTestIds = extractFailingTestIds(testOutput);

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
        failingTestIds,
        passingTestIds: passed > 0 ? [`${candidateId}-tests-passed`] : [],
      },
      diagnostics,
      acceptance,
      adversarial,
      metamorphic,
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
