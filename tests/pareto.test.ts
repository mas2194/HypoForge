import { describe, it, expect } from "vitest";
import { compareWithPareto, dominates } from "../src/evaluator/pareto.js";
import { VerificationResultSchema } from "../src/schemas/result.js";
import type { CandidateImplementation } from "../src/schemas/candidate.js";

describe("Pareto & Hard-Gates Evaluation", () => {
  const dummyImplA: CandidateImplementation = {
    candidateId: "cand-structural",
    level: "redesign",
    hypothesis: "Structural redesign of cache layer",
    experiment: "Benchmark under concurrency",
    worktreePath: "/tmp/worktree-a",
    branchName: "agent/test/cand-structural",
  };

  const dummyImplB: CandidateImplementation = {
    candidateId: "cand-local-patch",
    level: "local",
    hypothesis: "Quick patch with global lock",
    experiment: "Run single thread test",
    worktreePath: "/tmp/worktree-b",
    branchName: "agent/test/cand-local-patch",
  };

  const baseline = VerificationResultSchema.parse({
    candidateId: "baseline-0",
    isBaseline: true,
    hardGates: {
      testsPassed: true,
      noRegressions: true,
      typecheckPassed: true,
      lintPassed: true,
      passedAll: true,
      failureReasons: [],
    },
    softMetrics: {
      performanceImprovementPercent: 0,
      complexityDelta: 0,
      addedLines: 0,
      deletedLines: 0,
      fileCount: 0,
      architecturalInterventionLevel: 0,
      confidenceScore: 1.0,
    },
    tests: { passed: 10, failed: 0, output: "OK", exitCode: 0 },
    regressions: [],
    score: 100,
  });

  it("should disqualify candidates that fail Hard Gates (zero tolerance for regressions)", () => {
    const passingVerif = VerificationResultSchema.parse({
      candidateId: "cand-structural",
      isBaseline: false,
      hardGates: {
        testsPassed: true,
        noRegressions: true,
        typecheckPassed: true,
        lintPassed: true,
        passedAll: true,
        failureReasons: [],
      },
      softMetrics: {
        performanceImprovementPercent: 15,
        complexityDelta: 20,
        addedLines: 15,
        deletedLines: 5,
        fileCount: 2,
        architecturalInterventionLevel: 3,
        confidenceScore: 1.0,
      },
      tests: { passed: 12, failed: 0, output: "OK", exitCode: 0 },
      regressions: [],
      score: 145,
    });

    const failingVerif = VerificationResultSchema.parse({
      candidateId: "cand-local-patch",
      isBaseline: false,
      hardGates: {
        testsPassed: false,
        noRegressions: false,
        typecheckPassed: true,
        lintPassed: true,
        passedAll: false,
        failureReasons: ["Regression test failed: timeout under contention"],
      },
      softMetrics: {
        performanceImprovementPercent: 0,
        complexityDelta: 2,
        addedLines: 2,
        deletedLines: 0,
        fileCount: 1,
        architecturalInterventionLevel: 1,
        confidenceScore: 0.0,
      },
      tests: { passed: 9, failed: 1, output: "Failed", exitCode: 1 },
      regressions: ["Regression test failed"],
      score: -100,
    });

    const result = compareWithPareto(
      [
        { implementation: dummyImplA, verification: passingVerif },
        { implementation: dummyImplB, verification: failingVerif },
      ],
      baseline
    );

    expect(result.rankedQueue.length).toBe(1);
    expect(result.rankedQueue[0].implementation.candidateId).toBe("cand-structural");
    expect(result.disqualified.length).toBe(1);
    expect(result.disqualified[0].candidate.implementation.candidateId).toBe("cand-local-patch");
  });

  it("should prevent Goodhart bias by prioritizing structural coherence over minimal diff", () => {
    // Candidate A: Root cause architectural solution (Level 3), +25% performance, +120 lines
    const candA = VerificationResultSchema.parse({
      candidateId: "cand-structural",
      isBaseline: false,
      hardGates: {
        testsPassed: true,
        noRegressions: true,
        typecheckPassed: true,
        lintPassed: true,
        passedAll: true,
        failureReasons: [],
      },
      softMetrics: {
        performanceImprovementPercent: 25,
        complexityDelta: 140,
        addedLines: 120,
        deletedLines: 20,
        fileCount: 3,
        architecturalInterventionLevel: 3,
        confidenceScore: 1.0,
      },
      tests: { passed: 10, failed: 0, output: "OK", exitCode: 0 },
      regressions: [],
      score: 135,
    });

    // Candidate B: Quick workaround patch (Level 1), +2% performance, only +3 lines
    const candB = VerificationResultSchema.parse({
      candidateId: "cand-local-patch",
      isBaseline: false,
      hardGates: {
        testsPassed: true,
        noRegressions: true,
        typecheckPassed: true,
        lintPassed: true,
        passedAll: true,
        failureReasons: [],
      },
      softMetrics: {
        performanceImprovementPercent: 2,
        complexityDelta: 3,
        addedLines: 3,
        deletedLines: 0,
        fileCount: 1,
        architecturalInterventionLevel: 1,
        confidenceScore: 1.0,
      },
      tests: { passed: 10, failed: 0, output: "OK", exitCode: 0 },
      regressions: [],
      score: 115,
    });

    // Both pass Hard Gates. Lexicographic order must pick Candidate A (architectural coherence) first,
    // refusing to capitulate to the "minimal diff" heuristic.
    const result = compareWithPareto(
      [
        { implementation: dummyImplB, verification: candB },
        { implementation: dummyImplA, verification: candA },
      ],
      baseline
    );

    expect(result.rankedQueue.length).toBe(2);
    expect(result.rankedQueue[0].implementation.candidateId).toBe("cand-structural");
    expect(result.rankedQueue[1].implementation.candidateId).toBe("cand-local-patch");
  });

  it("should evaluate Pareto dominance correctly", () => {
    const superior = VerificationResultSchema.parse({
      candidateId: "superior",
      isBaseline: false,
      hardGates: { testsPassed: true, noRegressions: true, typecheckPassed: true, lintPassed: true, passedAll: true, failureReasons: [] },
      softMetrics: {
        performanceImprovementPercent: 30,
        complexityDelta: 10,
        addedLines: 10,
        deletedLines: 0,
        fileCount: 1,
        architecturalInterventionLevel: 3,
        confidenceScore: 1.0,
      },
      tests: { passed: 1, failed: 0, output: "", exitCode: 0 },
      regressions: [],
      score: 145,
    });

    const inferior = VerificationResultSchema.parse({
      candidateId: "inferior",
      isBaseline: false,
      hardGates: { testsPassed: true, noRegressions: true, typecheckPassed: true, lintPassed: true, passedAll: true, failureReasons: [] },
      softMetrics: {
        performanceImprovementPercent: 10,
        complexityDelta: 50,
        addedLines: 50,
        deletedLines: 0,
        fileCount: 2,
        architecturalInterventionLevel: 1,
        confidenceScore: 1.0,
      },
      tests: { passed: 1, failed: 0, output: "", exitCode: 0 },
      regressions: [],
      score: 115,
    });

    expect(dominates(superior, inferior)).toBe(true);
    expect(dominates(inferior, superior)).toBe(false);
  });
});
