import { describe, it, expect } from "vitest";
import { StructuredEvidenceStore } from "../src/orchestrator/evidence-store.js";
import { evaluateDiagnosticDeltas, compareWithPareto } from "../src/evaluator/pareto.js";
import { MetamorphicOracleRunner } from "../src/evaluator/oracle.js";
import { computeDPOConfidenceWeight } from "../src/trajectory/exporter.js";
import { mapTargetToDeepPhase } from "../src/orchestrator/deep-controller.js";
import { BacktrackTarget } from "../src/orchestrator/backtrack-router.js";
import type { VerificationResult, DiagnosticItem } from "../src/schemas/result.js";
import type { CandidateImplementation } from "../src/schemas/candidate.js";

describe("Autonomous Kernel & Hierarchical Controller Features", () => {
  it("should enforce exact direct backtrack routing mapping in DeepController FSM", () => {
    expect(mapTargetToDeepPhase(BacktrackTarget.Implement)).toBe("IMPLEMENT");
    expect(mapTargetToDeepPhase(BacktrackTarget.Falsify)).toBe("FALSIFY");
    expect(mapTargetToDeepPhase(BacktrackTarget.Research)).toBe("RESEARCH");
    expect(mapTargetToDeepPhase(BacktrackTarget.Diagnose)).toBe("DIAGNOSE");
    expect(mapTargetToDeepPhase(BacktrackTarget.Inspect)).toBe("DIAGNOSE");
  });

  it("should isolate 4 tiers of evidence in StructuredEvidenceStore without lossy compression", () => {
    const store = new StructuredEvidenceStore();

    store.addObservation({
      source: "vitest",
      content: "Test suite exit code 0, 42 tests passed, 0 failed",
      data: { exitCode: 0 },
    });

    store.addAssertion({
      source: "ADR-0001",
      content: "Cache lock order must acquire Resource A before Resource B",
    });

    store.addInference({
      source: "falsifier",
      content: "Suspected race condition when worker count exceeds 16",
      confidence: 0.82,
      falsified: false,
    });

    store.addInference({
      source: "falsifier",
      content: "Increasing buffer size to 1GB prevents OOM",
      confidence: 0.4,
      falsified: true,
    });

    store.addDecision({
      source: "triage",
      content: "DEEP exploration path selected",
    });

    expect(store.getAllObservations().length).toBe(1);
    expect(store.getAllAssertions().length).toBe(1);
    expect(store.getAllInferences().length).toBe(2);
    expect(store.getAllDecisions().length).toBe(1);

    const projection = store.projectPromptView();
    expect(projection.factsAndObservations[0]).toContain("[FACT/vitest]");
    expect(projection.activeAssertions[0]).toContain("[INVARIANT/ADR-0001]");
    expect(projection.survivingInferences[0]).toContain("[HYPOTHESIS");
    expect(projection.refutedInferences[0]).toContain("[REFUTED]");
  });

  it("should evaluate type/lint identity delta correctly (preventing false pass on count equality)", () => {
    const baselineDiagnostics: DiagnosticItem[] = [
      {
        filePath: "src/legacy.ts",
        line: 10,
        code: "TS2322",
        message: "Type 'string' is not assignable to type 'number'",
        identityHash: "hash-legacy-1",
      },
    ];

    // Candidate fixed the legacy bug, but introduced a brand new bug in new-file.ts
    const candidateDiagnostics: DiagnosticItem[] = [
      {
        filePath: "src/new-file.ts",
        line: 50,
        code: "TS2345",
        message: "Argument of type 'null' is not assignable",
        identityHash: "hash-new-bug-2",
      },
    ];

    const delta = evaluateDiagnosticDeltas(baselineDiagnostics, candidateDiagnostics);

    // Count is 1 <= 1, but Identity Delta detects new regression!
    expect(delta.newErrors.length).toBe(1);
    expect(delta.newErrors[0].identityHash).toBe("hash-new-bug-2");
    expect(delta.resolvedErrors.length).toBe(1);
    expect(delta.resolvedErrors[0].identityHash).toBe("hash-legacy-1");
  });

  it("should support baseline-relative Hard Gate in repositories with existing failing tests", () => {
    const baseline: VerificationResult = {
      candidateId: "baseline-0",
      isBaseline: true,
      hardGates: {
        testsPassed: false,
        noRegressions: true,
        typecheckPassed: true,
        lintPassed: true,
        testIntegrityPassed: true,
        passedAll: false,
        failureReasons: ["Existing legacy test failed"],
      },
      softMetrics: {
        performanceImprovementPercent: 0,
        complexityDelta: 0,
        addedLines: 0,
        deletedLines: 0,
        fileCount: 0,
        architecturalInterventionLevel: 0,
        confidenceScore: 0.5,
      },
      tests: {
        passed: 98,
        failed: 2,
        output: "FAIL tests/legacy-broken.test.ts",
        exitCode: 1,
        failingTestIds: ["test_legacy_broken_a", "test_legacy_broken_b"],
        passingTestIds: ["test_core_feature"],
      },
      diagnostics: { typeErrors: [], lintErrors: [] },
      metamorphic: { tested: false, passed: true, properties: {}, failureReasons: [] },
      regressions: [],
      score: 50,
    };

    const goodCandidate: { implementation: CandidateImplementation; verification: VerificationResult } = {
      implementation: {
        candidateId: "cand-clean",
        level: "local",
        worktreePath: "/tmp/cand-clean",
        branchName: "agent/run-1/cand-clean",
      },
      verification: {
        candidateId: "cand-clean",
        isBaseline: false,
        hardGates: {
          testsPassed: false,
          noRegressions: true,
          typecheckPassed: true,
          lintPassed: true,
          testIntegrityPassed: true,
          passedAll: true,
          failureReasons: [],
        },
        softMetrics: {
          performanceImprovementPercent: 5,
          complexityDelta: 10,
          addedLines: 10,
          deletedLines: 0,
          fileCount: 1,
          architecturalInterventionLevel: 1,
          confidenceScore: 1.0,
        },
        tests: {
          passed: 99,
          failed: 2, // Same 2 legacy failures, but resolved the goal!
          output: "FAIL tests/legacy-broken.test.ts",
          exitCode: 1,
          failingTestIds: ["test_legacy_broken_a", "test_legacy_broken_b"],
          passingTestIds: ["test_core_feature", "test_required_feature"],
        },
        diagnostics: { typeErrors: [], lintErrors: [] },
        metamorphic: { tested: false, passed: true, properties: {}, failureReasons: [] },
        regressions: [],
        score: 110,
      },
    };

    const result = compareWithPareto([goodCandidate], baseline, ["test_required_feature"]);
    expect(result.disqualified.length).toBe(0);
    expect(result.rankedQueue.length).toBe(1);
    expect(result.rankedQueue[0].implementation.candidateId).toBe("cand-clean");
  });

  it("should evaluate Tier 3 Metamorphic Properties (Idempotence & Round-Trip)", async () => {
    const runner = new MetamorphicOracleRunner();

    const normalize = (str: string) => str.trim().toLowerCase();
    const idempotenceProp = MetamorphicOracleRunner.createIdempotenceProperty(
      "string_normalization_idempotence",
      normalize,
      "  HELLO WORLD  "
    );

    const roundTripProp = MetamorphicOracleRunner.createRoundTripProperty(
      "json_round_trip",
      (obj) => JSON.stringify(obj),
      (json) => JSON.parse(json),
      { key: "value", numbers: [1, 2, 3] }
    );

    const result = await runner.evaluateProperties(null, [idempotenceProp, roundTripProp]);
    expect(result.tested).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.properties["string_normalization_idempotence"]).toBe(true);
    expect(result.properties["json_round_trip"]).toBe(true);
  });

  it("should calibrate continuous DPO confidence weights based on provenance and stability", () => {
    const w1 = computeDPOConfidenceWeight({ provenance: "self_reviewed" });
    const w2 = computeDPOConfidenceWeight({ provenance: "machine_verified" });
    const w3 = computeDPOConfidenceWeight({
      provenance: "ci_verified",
      tier3MetamorphicPassed: true,
      scoreDelta: 40,
    });
    const w4 = computeDPOConfidenceWeight({
      provenance: "post_merge_success",
      tier3MetamorphicPassed: true,
      stableDays: 14,
    });

    expect(w1).toBeLessThan(w2);
    expect(w2).toBeLessThan(w3);
    expect(w3).toBeLessThan(w4);
    expect(w4).toBe(1.0);
  });
});
