import { describe, it, expect } from "vitest";
import { evaluateDiversity, enforceDiversity } from "../src/phases/diversity-gate.js";
import { routeBacktrack, BacktrackTarget } from "../src/orchestrator/backtrack-router.js";
import type { CandidateHypothesis } from "../src/schemas/diagnosis.js";

describe("Hypothesis Diversity Gate", () => {
  it("should reject candidate sets that collapse onto the exact same local tier", () => {
    const homogeneousCandidates: CandidateHypothesis[] = [
      {
        id: "cand-1",
        level: "L1_function_implementation",
        levelNumber: 1,
        hypothesis: "Tweak regex in validation function",
        experiment: "Run unit test",
        strategy: "local_patch",
        worthExperimenting: true,
      },
      {
        id: "cand-2",
        level: "L1_function_implementation",
        levelNumber: 1,
        hypothesis: "Add null check in validation function",
        experiment: "Run unit test",
        strategy: "local_patch",
        worthExperimenting: true,
      },
    ];

    const result = evaluateDiversity(homogeneousCandidates);
    expect(result.passed).toBe(false);
    expect(result.distinctLevels).toBe(1);
    expect(result.recommendations.length).toBeGreaterThanOrEqual(1);
    expect(result.recommendations[0]).toContain("collapse onto identical Intervention Ladder level");
  });

  it("should pass candidate sets spanning multiple distinct Intervention Ladder tiers", () => {
    const diverseCandidates: CandidateHypothesis[] = [
      {
        id: "cand-local",
        level: "L1_function_implementation",
        levelNumber: 1,
        hypothesis: "Fix local loop counter",
        experiment: "Run tests",
        strategy: "local_patch",
        worthExperimenting: true,
      },
      {
        id: "cand-redesign",
        level: "L6_architecture",
        levelNumber: 6,
        hypothesis: "Decouple buffer management into standalone thread-safe subsystem",
        experiment: "Run stress benchmark",
        strategy: "structural_redesign",
        worthExperimenting: true,
      },
    ];

    const result = evaluateDiversity(diverseCandidates);
    expect(result.passed).toBe(true);
    expect(result.distinctLevels).toBe(2);
    expect(result.recommendations.length).toBe(0);
  });

  it("should automatically enforce diversity when candidate pool is homogeneous", () => {
    const homogeneous: CandidateHypothesis[] = [
      {
        id: "cand-1",
        level: "L1_function_implementation",
        levelNumber: 1,
        hypothesis: "Local fix",
        experiment: "test",
        strategy: "local_patch",
        worthExperimenting: true,
      },
      {
        id: "cand-2",
        level: "L1_function_implementation",
        levelNumber: 1,
        hypothesis: "Another local fix",
        experiment: "test",
        strategy: "local_patch",
        worthExperimenting: true,
      },
    ];

    const diversified = enforceDiversity(homogeneous);
    const evalResult = evaluateDiversity(diversified);
    expect(evalResult.passed).toBe(true);
    expect(diversified[1].level).toBe("L6_architecture");
    expect(diversified[1].strategy).toBe("structural_redesign");
  });
});

describe("Backtrack Router", () => {
  it("should route invariant/repository structure errors to Inspect", () => {
    const reasons = ["Violation of architectural invariant: state must not cross worker boundary"];
    const decision = routeBacktrack(reasons);
    expect(decision.target).toBe(BacktrackTarget.Inspect);
    expect(decision.failureMode).toContain("Invariant");
  });

  it("should route external library/API specification mismatches to Research", () => {
    const reasons = ["External library API spec change in v3 breaks this usage"];
    const decision = routeBacktrack(reasons);
    expect(decision.target).toBe(BacktrackTarget.Research);
    expect(decision.failureMode).toContain("External Specification");
  });

  it("should route unhandled edge cases / counterexamples to Falsify", () => {
    const reasons = ["Discovered unhandled counterexample during boundary condition audit"];
    const decision = routeBacktrack(reasons);
    expect(decision.target).toBe(BacktrackTarget.Falsify);
    expect(decision.failureMode).toContain("Counterexample");
  });

  it("should route simple syntax/typo errors directly to Implement", () => {
    const reasons = ["Syntax error: unexpected token in generated TypeScript file"];
    const decision = routeBacktrack(reasons);
    expect(decision.target).toBe(BacktrackTarget.Implement);
    expect(decision.failureMode).toContain("Localized Implementation");
  });

  it("should route concurrency/architectural defects to Diagnose", () => {
    const reasons = ["Critical deadlock hazard detected under concurrent worker load"];
    const decision = routeBacktrack(reasons);
    expect(decision.target).toBe(BacktrackTarget.Diagnose);
    expect(decision.failureMode).toContain("Concurrency");
  });
});
