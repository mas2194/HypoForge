import type { CandidateImplementation } from "../schemas/candidate.js";
import type { VerificationResult, DiagnosticItem } from "../schemas/result.js";

export interface CandidateWithVerification {
  implementation: CandidateImplementation;
  verification: VerificationResult;
}

export interface ParetoComparisonResult {
  rankedQueue: CandidateWithVerification[];
  disqualified: Array<{
    candidate: CandidateWithVerification;
    reasons: string[];
  }>;
  baseline: VerificationResult;
  baselineDominatesAll: boolean;
  summary: string;
}

/**
 * Computes exact identity deltas between baseline and candidate diagnostics (type/lint).
 * Avoids count-based false positives where an existing bug is fixed but a new bug is introduced.
 */
export function evaluateDiagnosticDeltas(
  baseline: DiagnosticItem[] = [],
  candidate: DiagnosticItem[] = []
): {
  newErrors: DiagnosticItem[];
  resolvedErrors: DiagnosticItem[];
  persistentErrors: DiagnosticItem[];
} {
  const baseMap = new Map(baseline.map((d) => [d.identityHash, d]));
  const candMap = new Map(candidate.map((d) => [d.identityHash, d]));

  const newErrors: DiagnosticItem[] = [];
  const persistentErrors: DiagnosticItem[] = [];

  for (const [hash, item] of candMap.entries()) {
    if (baseMap.has(hash)) {
      persistentErrors.push(item);
    } else {
      newErrors.push(item);
    }
  }

  const resolvedErrors = baseline.filter((d) => !candMap.has(d.identityHash));
  return { newErrors, resolvedErrors, persistentErrors };
}

/**
 * Checks whether Candidate A Pareto-dominates Candidate B across multi-objective dimensions.
 * Criteria:
 * 1. Performance Improvement Percent (higher is better)
 * 2. Simplicity / Diff Efficiency (fewer added lines / lower churn is better - Occam's Razor)
 * 3. Confidence Score (higher is better)
 * 
 * NOTE: Architectural Intervention Level is NOT an objective to maximize (which would create
 * maximum-intervention bias / gratuitous refactoring). It is retained purely as an exploratory tag.
 */
export function dominates(a: VerificationResult, b: VerificationResult): boolean {
  const aPerf = a.softMetrics?.performanceImprovementPercent ?? 0;
  const bPerf = b.softMetrics?.performanceImprovementPercent ?? 0;

  // Diff simplicity: fewer net added lines is simpler and carries less regression risk
  const aAdded = a.softMetrics?.addedLines ?? a.complexity?.addedLines ?? 0;
  const bAdded = b.softMetrics?.addedLines ?? b.complexity?.addedLines ?? 0;

  const aConf = a.softMetrics?.confidenceScore ?? 1.0;
  const bConf = b.softMetrics?.confidenceScore ?? 1.0;

  const atLeastAsGood = aPerf >= bPerf && aAdded <= bAdded && aConf >= bConf;
  const strictlyBetter = aPerf > bPerf || aAdded < bAdded || aConf > bConf;

  return atLeastAsGood && strictlyBetter;
}

/**
 * Performs a rigorous Baseline-Relative Hard-Gate filter followed by Pareto & Lexicographic ranking.
 * Implements Identity Delta for type/lint and delta check for test failures.
 * Real-world repos with existing failing tests are supported without false disqualification.
 */
export function compareWithPareto(
  candidates: CandidateWithVerification[],
  baseline: VerificationResult,
  requiredAcceptanceTestIds?: string[]
): ParetoComparisonResult {
  const qualified: CandidateWithVerification[] = [];
  const disqualified: Array<{ candidate: CandidateWithVerification; reasons: string[] }> = [];

  const baseFailingIds = new Set(baseline.tests.failingTestIds ?? []);
  const baseTypeErrors = baseline.diagnostics?.typeErrors ?? [];
  const baseLintErrors = baseline.diagnostics?.lintErrors ?? [];

  // 1. Baseline-Relative Hard Gates Evaluation
  for (const item of candidates) {
    const hard = item.verification.hardGates;
    const reasons: string[] = [];

    // 1.1 Test Failure Delta Evaluation
    const candFailingIds = new Set(item.verification.tests.failingTestIds ?? []);
    if (candFailingIds.size > 0 || baseFailingIds.size > 0) {
      const newFailures = [...candFailingIds].filter((id) => !baseFailingIds.has(id));
      if (newFailures.length > 0) {
        reasons.push(`New test failure(s) relative to baseline: ${newFailures.join(", ")}`);
      }
    } else {
      // Fallback to count delta if fine-grained IDs are unavailable
      if (item.verification.tests.failed > baseline.tests.failed) {
        reasons.push(
          `Test failures regressed: ${item.verification.tests.failed} failed vs baseline ${baseline.tests.failed}`
        );
      }
    }

    // 1.2 Required Acceptance Tests Check
    if (requiredAcceptanceTestIds && requiredAcceptanceTestIds.length > 0) {
      const missingRequired = requiredAcceptanceTestIds.filter((id) => candFailingIds.has(id));
      if (missingRequired.length > 0) {
        reasons.push(`Required acceptance test(s) failed: ${missingRequired.join(", ")}`);
      }
    }

    // 1.3 Regressions detection (Identity Delta relative to baseline regressions)
    const baseRegressions = new Set(baseline.regressions ?? []);
    const newRegressions = item.verification.regressions.filter((r) => !baseRegressions.has(r));
    if (newRegressions.length > 0) {
      reasons.push(`Newly introduced regression(s): ${newRegressions.join(", ")}`);
    }

    // 1.4 Test & Oracle Integrity
    if (!hard.testIntegrityPassed) {
      reasons.push("Test / Oracle Integrity violation (test tampering or suppression detected)");
    }

    // 1.5 Tier 3 Metamorphic & Invariant Testing
    if (item.verification.metamorphic?.tested && !item.verification.metamorphic.passed) {
      reasons.push(
        `Tier 3 Metamorphic / Invariant violation: ${item.verification.metamorphic.failureReasons.join(", ")}`
      );
    }

    // 1.6 Identity Delta for Typecheck
    const typeDelta = evaluateDiagnosticDeltas(baseTypeErrors, item.verification.diagnostics?.typeErrors);
    if (typeDelta.newErrors.length > 0) {
      reasons.push(
        `New type error(s) introduced: ${typeDelta.newErrors.map((e) => `${e.filePath}:${e.code}`).join(", ")}`
      );
    } else if (!hard.typecheckPassed && baseTypeErrors.length === 0) {
      reasons.push("Typecheck / Build error");
    }

    // 1.7 Identity Delta for Lint
    const lintDelta = evaluateDiagnosticDeltas(baseLintErrors, item.verification.diagnostics?.lintErrors);
    if (lintDelta.newErrors.length > 0) {
      reasons.push(
        `New lint error(s) introduced: ${lintDelta.newErrors.map((e) => `${e.filePath}:${e.code}`).join(", ")}`
      );
    } else if (!hard.lintPassed && baseLintErrors.length === 0) {
      reasons.push("Lint error");
    }

    if (reasons.length === 0) {
      qualified.push(item);
    } else {
      disqualified.push({ candidate: item, reasons });
    }
  }

  // 2. Baseline Candidate 0 Evaluation
  const baselinePassedHardGates =
    baseline.hardGates.passedAll &&
    baseline.regressions.length === 0 &&
    baseline.hardGates.testIntegrityPassed;

  let baselineDominatesAll = false;
  if (qualified.length === 0) {
    baselineDominatesAll = baselinePassedHardGates;
    return {
      rankedQueue: [],
      disqualified,
      baseline,
      baselineDominatesAll,
      summary: baselinePassedHardGates
        ? "All candidates failed Hard Gates. Baseline passes requirements and remains untouched."
        : "All candidates AND baseline failed Hard Gates. Issue requires re-exploration or deeper backtracking.",
    };
  }

  // 3. Multi-objective Pareto Frontier and Lexicographic Sort
  // Lexicographic ordering principle based on AGENTS.md:
  // 1. Correctness (Guaranteed by Hard Gates & Test Integrity)
  // 2. Performance Improvement (Benchmark delta)
  // 3. Simplicity / Diff Efficiency (Avoid gratuitous bloat: Occam's Razor - clean 30 LOC > rewrite 800 LOC)
  // 4. Verification Confidence
  const ranked = [...qualified].sort((a, b) => {
    // 3.1 Check Pareto dominance
    if (dominates(a.verification, b.verification)) return -1;
    if (dominates(b.verification, a.verification)) return 1;

    // 3.2 Lexicographic ordering:
    // Dimension A: Performance improvement % (higher is better)
    const perfA = a.verification.softMetrics?.performanceImprovementPercent ?? 0;
    const perfB = b.verification.softMetrics?.performanceImprovementPercent ?? 0;
    if (perfA !== perfB) {
      return perfB - perfA; // descending
    }

    // Dimension B: Diff Simplicity (fewer added lines is simpler and less risky)
    const linesA = a.verification.softMetrics?.addedLines ?? a.verification.complexity?.addedLines ?? 0;
    const linesB = b.verification.softMetrics?.addedLines ?? b.verification.complexity?.addedLines ?? 0;
    if (linesA !== linesB) {
      return linesA - linesB; // ascending (clean local fix preferred over massive rewrite when effects match)
    }

    // Dimension C: Fallback to verification score
    return b.verification.score - a.verification.score;
  });


  return {
    rankedQueue: ranked,
    disqualified,
    baseline,
    baselineDominatesAll: false,
    summary: `Qualified ${ranked.length} candidate(s) via Hard Gates. Top candidate: ${ranked[0]?.implementation.candidateId}. Disqualified: ${disqualified.length}.`,
  };
}
