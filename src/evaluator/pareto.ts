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
 * Criteria (higher is better for all normalized dimensions):
 * 1. Architectural Intervention Level (higher ladder level addresses root cause deeper)
 * 2. Performance Improvement Percent (higher is better)
 * 3. Simplicity / Diff Efficiency (fewer added lines / lower complexity is better)
 */
export function dominates(a: VerificationResult, b: VerificationResult): boolean {
  const aArch = a.softMetrics?.architecturalInterventionLevel ?? 1;
  const bArch = b.softMetrics?.architecturalInterventionLevel ?? 1;

  const aPerf = a.softMetrics?.performanceImprovementPercent ?? 0;
  const bPerf = b.softMetrics?.performanceImprovementPercent ?? 0;

  // Diff simplicity: fewer net added lines is considered more maintainable/simpler
  const aAdded = a.softMetrics?.addedLines ?? a.complexity?.addedLines ?? 0;
  const bAdded = b.softMetrics?.addedLines ?? b.complexity?.addedLines ?? 0;

  const atLeastAsGood = aArch >= bArch && aPerf >= bPerf && aAdded <= bAdded;
  const strictlyBetter = aArch > bArch || aPerf > bPerf || aAdded < bAdded;

  return atLeastAsGood && strictlyBetter;
}

/**
 * Performs a rigorous Hard-Gate filter followed by Pareto & Lexicographic ranking.
 * Prevents Goodhart's Law collapse associated with scalar weighted-sum scoring.
 * Evaluates candidates against Candidate 0 (main branch baseline).
 */
export function compareWithPareto(
  candidates: CandidateWithVerification[],
  baseline: VerificationResult
): ParetoComparisonResult {
  const qualified: CandidateWithVerification[] = [];
  const disqualified: Array<{ candidate: CandidateWithVerification; reasons: string[] }> = [];

  // 1. Hard Gates Evaluation
  for (const item of candidates) {
    const hard = item.verification.hardGates;
    const reasons: string[] = [];

    if (!hard.testsPassed || item.verification.tests.failed > 0) {
      reasons.push(`Test suite failed (${item.verification.tests.failed} failure(s))`);
    }
    if (!hard.noRegressions || item.verification.regressions.length > 0) {
      reasons.push(`Detected regressions: ${item.verification.regressions.join(", ")}`);
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

  // 2. Baseline Comparison
  // If baseline tests are already failing in main, qualified candidates with passing tests strictly improve the repo.
  // If baseline passes, candidates must provide non-trivial architectural coherence or performance gain.
  let baselineDominatesAll = false;
  if (qualified.length === 0) {
    baselineDominatesAll = true;
    return {
      rankedQueue: [],
      disqualified,
      baseline,
      baselineDominatesAll: true,
      summary: "All candidates failed Hard Gates (tests/regressions). Baseline remains untouched.",
    };
  }

  // 3. Multi-objective Pareto Frontier and Lexicographic Sort
  // Lexicographic ordering principle based on AGENTS.md:
  // 1. Correctness (Guaranteed by Hard Gates)
  // 2. Architectural Coherence / Ladder Level (Root cause vs workaround)
  // 3. Performance Improvement (Benchmark delta)
  // 4. Simplicity / Diff Risk (Avoid gratuitous code bloat)
  const ranked = [...qualified].sort((a, b) => {
    // 3.1 Check Pareto dominance first
    if (dominates(a.verification, b.verification)) return -1;
    if (dominates(b.verification, a.verification)) return 1;

    // 3.2 Lexicographic ordering:
    // Dimension A: Architectural Intervention Level (higher is better)
    const archA = a.verification.softMetrics?.architecturalInterventionLevel ?? 1;
    const archB = b.verification.softMetrics?.architecturalInterventionLevel ?? 1;
    if (archA !== archB) {
      return archB - archA; // descending
    }

    // Dimension B: Performance improvement % (higher is better)
    const perfA = a.verification.softMetrics?.performanceImprovementPercent ?? 0;
    const perfB = b.verification.softMetrics?.performanceImprovementPercent ?? 0;
    if (perfA !== perfB) {
      return perfB - perfA; // descending
    }

    // Dimension C: Diff Simplicity (fewer added lines is simpler)
    const linesA = a.verification.softMetrics?.addedLines ?? a.verification.complexity?.addedLines ?? 0;
    const linesB = b.verification.softMetrics?.addedLines ?? b.verification.complexity?.addedLines ?? 0;
    if (linesA !== linesB) {
      return linesA - linesB; // ascending (smaller diff preferred when arch & perf are identical)
    }

    // Dimension D: Fallback to verification score
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
