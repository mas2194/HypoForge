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

function normalizeExitCode(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  // Spawn failures (for example ENOENT) expose a string code, not a process exit status.
  return 1;
}

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

export function computeEvidenceStrength(params: {
  testsPassed: boolean;
  testIntegrityPassed: boolean;
  totalTests: number;
  passedTests: number;
  diagnosticErrorsCount: number;
  regressionCount: number;
  acceptanceTested: boolean;
  acceptancePassed: boolean;
  adversarialTested: boolean;
  adversarialPassed: boolean;
  metamorphicTested: boolean;
  metamorphicPassed: boolean;
  perfImprovementPercent: number;
}): number {
  if (!params.testsPassed || !params.testIntegrityPassed || params.regressionCount > 0) {
    return 0.0;
  }

  // Without an executed suite, retain only a small amount of evidence for
  // passing integrity and diagnostic checks; an untested candidate must not
  // receive the same evidence score as a tested one.
  let strength = params.totalTests > 0 ? 0.50 : 0.0;

  // Ratio of passed tests (up to 0.15)
  const passRatio = params.totalTests > 0 ? params.passedTests / params.totalTests : 0.0;
  strength += Math.min(0.15, passRatio * 0.15);

  // Clean compiler/linter diagnostics (+0.10 if zero new diagnostic errors)
  if (params.totalTests > 0 && params.diagnosticErrorsCount === 0) {
    strength += 0.10;
  }

  // Tier 2: Acceptance Oracle passed (+0.08)
  if (params.acceptanceTested && params.acceptancePassed) {
    strength += 0.08;
  }

  // Tier 3: Adversarial Oracle passed (+0.09)
  if (params.adversarialTested && params.adversarialPassed) {
    strength += 0.09;
  }

  // Tier 4: Metamorphic & Invariant Oracle passed (+0.08)
  if (params.metamorphicTested && params.metamorphicPassed) {
    strength += 0.08;
  }

  // Measured performance gains (+up to 0.05)
  if (params.perfImprovementPercent > 0) {
    strength += Math.min(0.05, (params.perfImprovementPercent / 100) * 0.05);
  }

  return Math.min(1.0, Math.max(0.0, Math.round(strength * 100) / 100));
}

export class Evaluator {
  /**
   * Evaluates Candidate 0 (Baseline on main branch).
   * Used as the control baseline to guarantee proposed changes provide genuine superiority.
   */
  async runBaselineVerification(options: RunBaselineOptions): Promise<VerificationResult> {
    const { repoPath, testCommand } = options;
    let testOutput = "";
    let passed = 0;
    let failed = 0;
    let exitCode = 0;
    const regressions: string[] = [];

    if (testCommand) {
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
        exitCode = normalizeExitCode(err.code);
        regressions.push(`Baseline test command failed: ${testCommand}`);
      }
    } else {
      testOutput = "No mandatory test command configured; candidate agent selects whether testing is useful.";
    }

    const failingTestIds = extractFailingTestIds(testOutput);
    const diagnostics = extractDiagnostics(testOutput);
    const testsPassed = !testCommand || (failed === 0 && passed > 0);
    const hardGates = {
      testsPassed,
      noRegressions: regressions.length === 0,
      typecheckPassed: diagnostics.typeErrors.length === 0,
      lintPassed: diagnostics.lintErrors.length === 0,
      testIntegrityPassed: true,
      passedAll: testsPassed && regressions.length === 0,
      failureReasons: regressions,
    };

    const evidenceStrength = !testCommand ? 0.0 : testsPassed ? 1.0 : 0.0;
    const softMetrics = {
      performanceImprovementPercent: 0,
      complexityDelta: 0,
      addedLines: 0,
      deletedLines: 0,
      fileCount: 0,
      architecturalInterventionLevel: 0, // Baseline has 0 intervention
      evidenceStrength,
      confidenceScore: evidenceStrength,
    };

    return VerificationResultSchema.parse({
      candidateId: "baseline-0",
      isBaseline: true,
      hardGates,
      softMetrics,
      oracleBreakdown: {
        layer1BaselinePassed: testsPassed,
        layer2CandidateAuthoredPassed: true,
        layer2CandidateAuthoredCount: 0,
        layer3AdversarialPassed: true,
        layer4MetamorphicPassed: true,
        oracleIndependenceSatisfied: true,
      },
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
      testCommand,
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
    if (testCommand) {
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
        exitCode = normalizeExitCode(err.code);
        regressions.push(`Test command failed: ${testCommand}`);
      }
    } else {
      testOutput = "No mandatory test command configured; candidate agent selects whether testing is useful.";
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

    // 3.7 Oracle Independence: detect candidate-authored tests vs baseline
    let candidateAuthoredTestCount = 0;
    try {
      const { stdout: changedFiles } = await execAsync(
        `git diff --name-only ${baseBranch}...HEAD`,
        { cwd: worktreePath }
      );
      const testFileRegex = /(\.test\.|\.spec\.|__tests__\/|tests\/)/i;
      const testFiles = changedFiles.split("\n").filter((f) => testFileRegex.test(f.trim()));
      candidateAuthoredTestCount = testFiles.length;
    } catch {
      // non-fatal
    }

    // 4. Hard Gates Check
    const diagnostics = extractDiagnostics(testOutput);
    const testsPassed = !testCommand || (failed === 0 && passed > 0);
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

    const layer1BaselinePassed = testsPassed;
    const layer2CandidateAuthoredPassed = candidateAuthoredTestCount > 0 ? testsPassed : true;
    const layer3AdversarialPassed = adversarial.passed;
    const layer4MetamorphicPassed = metamorphic.passed;
    const oracleIndependenceSatisfied = integrityResult.passed && layer1BaselinePassed && layer3AdversarialPassed && layer4MetamorphicPassed;

    const oracleBreakdown = {
      layer1BaselinePassed,
      layer2CandidateAuthoredPassed,
      layer2CandidateAuthoredCount: candidateAuthoredTestCount,
      layer3AdversarialPassed,
      layer4MetamorphicPassed,
      oracleIndependenceSatisfied,
    };

    // 5. Objective Empirical Evidence Strength Calculation
    const evidenceStrength = computeEvidenceStrength({
      testsPassed,
      testIntegrityPassed,
      totalTests: passed + failed,
      passedTests: passed,
      diagnosticErrorsCount: diagnostics.typeErrors.length + diagnostics.lintErrors.length,
      regressionCount: regressions.length,
      acceptanceTested: acceptance.tested,
      acceptancePassed: acceptance.passed,
      adversarialTested: adversarial.tested,
      adversarialPassed: adversarial.passed,
      metamorphicTested: metamorphic.tested,
      metamorphicPassed: metamorphic.passed,
      perfImprovementPercent: perfImprovement,
    });

    // 6. Soft Metrics Profile
    const softMetrics = {
      performanceImprovementPercent: perfImprovement,
      complexityDelta: addedLines + deletedLines,
      addedLines,
      deletedLines,
      fileCount,
      architecturalInterventionLevel: interventionLevel,
      evidenceStrength,
      confidenceScore: evidenceStrength,
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
      oracleBreakdown,
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
