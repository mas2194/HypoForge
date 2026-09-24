import type { CandidateImplementation } from "../schemas/candidate.js";
import type { VerificationResult } from "../schemas/result.js";

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
 * Performs a rigorous Hard-Gate filter followed by Pareto & Lexicographic ranking.
 * Prevents Goodhart's Law collapse and maximum-intervention bias.
 * Evaluates candidates against Candidate 0 (main branch baseline).
 */
export function compareWithPareto(
  candidates: CandidateWithVerification[],
  baseline: VerificationResult
): ParetoComparisonResult {
  const qualified: CandidateWithVerification[] = [];
  const disqualified: Array<{ candidate: CandidateWithVerification; reasons: string[] }> = [];

  // 1. Hard Gates Evaluation (Tests, Invariants, Test Integrity, Lint, Typecheck)
  for (const item of candidates) {
    const hard = item.verification.hardGates;
    const reasons: string[] = [];

    if (!hard.testsPassed || item.verification.tests.failed > 0) {
      reasons.push(`Test suite failed (${item.verification.tests.failed} failure(s))`);
    }
    if (!hard.noRegressions || item.verification.regressions.length > 0) {
      reasons.push(`Detected regressions: ${item.verification.regressions.join(", ")}`);
    }
    if (!hard.testIntegrityPassed) {
      reasons.push("Test / Oracle Integrity violation (test tampering or suppression detected)");
    }
    if (!hard.typecheckPassed) {
      reasons.push("Typecheck / Build error");
    }
    if (!hard.lintPassed) {
      reasons.push("Lint error");
    }

    if (reasons.length === 0 && hard.passedAll) {
      qualified.push(item);
    } else {
      disqualified.push({ candidate: item, reasons });
    }
  }

  // 2. Baseline Candidate 0 Evaluation
  // Baseline is only valid if it clears Hard Gates and satisfies requirements.
  const baselinePassedHardGates =
    baseline.hardGates.passedAll &&
    baseline.tests.failed === 0 &&
    baseline.regressions.length === 0;

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
