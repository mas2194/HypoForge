import { describe, it, expect } from "vitest";
import { computeEvidenceStrength } from "../src/evaluator/runner.js";
import { dominates, compareWithPareto } from "../src/evaluator/pareto.js";
import { TrajectoryExporter } from "../src/trajectory/exporter.js";
import { ContextCompactor } from "../src/orchestrator/compactor.js";
import { DurableMemoryManager } from "../src/memory/durable-memory.js";
import { Phase, type HarnessContext } from "../src/orchestrator/context.js";
import type { VerificationResult } from "../src/schemas/result.js";

describe("Evaluator Calibration & Evidence System Refinements", () => {
  describe("1. Objective EvidenceStrength Calculation (replacing model self-reported confidence)", () => {
    it("computes rigorous empirical evidenceStrength based on multi-oracle observations", () => {
      // Ideal candidate: passes all tiers, 0 regressions, clean diagnostics
      const highEvidence = computeEvidenceStrength({
        testsPassed: true,
        testIntegrityPassed: true,
        totalTests: 10,
        passedTests: 10,
        diagnosticErrorsCount: 0,
        regressionCount: 0,
        acceptanceTested: true,
        acceptancePassed: true,
        adversarialTested: true,
        adversarialPassed: true,
        metamorphicTested: true,
        metamorphicPassed: true,
        perfImprovementPercent: 15,
      });

      // Base 0.5 + 0.15 (pass ratio) + 0.10 (clean diag) + 0.08 (acceptance) + 0.09 (adversarial) + 0.08 (metamorphic) + ~0.01 (perf) = 1.0 (capped at 1.0)
      expect(highEvidence).toBeGreaterThanOrEqual(0.95);
      expect(highEvidence).toBeLessThanOrEqual(1.0);
    });

    it("drops evidenceStrength to 0.0 immediately upon regressions or test tampering", () => {
      const regressedEvidence = computeEvidenceStrength({
        testsPassed: true,
        testIntegrityPassed: true,
        totalTests: 10,
        passedTests: 10,
        diagnosticErrorsCount: 0,
        regressionCount: 1, // introduced 1 regression
        acceptanceTested: false,
        acceptancePassed: true,
        adversarialTested: false,
        adversarialPassed: true,
        metamorphicTested: false,
        metamorphicPassed: true,
        perfImprovementPercent: 0,
      });
      expect(regressedEvidence).toBe(0.0);

      const tamperedEvidence = computeEvidenceStrength({
        testsPassed: true,
        testIntegrityPassed: false, // cheated or suppressed tests
        totalTests: 10,
        passedTests: 10,
        diagnosticErrorsCount: 0,
        regressionCount: 0,
        acceptanceTested: false,
        acceptancePassed: true,
        adversarialTested: false,
        adversarialPassed: true,
        metamorphicTested: false,
        metamorphicPassed: true,
        perfImprovementPercent: 0,
      });
      expect(tamperedEvidence).toBe(0.0);
    });
  });

  describe("2. Pareto Dominance driven by Objective Evidence Strength", () => {
    it("prioritizes candidate with superior evidenceStrength when diff and performance match", () => {
      const candidateA: VerificationResult = {
        candidateId: "cand-A",
        isBaseline: false,
        hardGates: {
          testsPassed: true,
          noRegressions: true,
          typecheckPassed: true,
          lintPassed: true,
          testIntegrityPassed: true,
          passedAll: true,
          failureReasons: [],
        },
        softMetrics: {
          performanceImprovementPercent: 10,
          complexityDelta: 20,
          addedLines: 20,
          deletedLines: 0,
          fileCount: 1,
          architecturalInterventionLevel: 2,
          evidenceStrength: 0.95, // Verified by acceptance, adversarial, and metamorphic oracles
          confidenceScore: 0.95,
        },
        tests: { passed: 5, failed: 0, output: "OK", exitCode: 0, failingTestIds: [], passingTestIds: [] },
        diagnostics: { typeErrors: [], lintErrors: [] },
        acceptance: { tested: true, passed: true, verifiedCriteria: [], missingCriteria: [] },
        adversarial: { tested: true, passed: true, scenarios: {}, failureReasons: [] },
        metamorphic: { tested: true, passed: true, properties: {}, failureReasons: [] },
        oracleBreakdown: {
          layer1BaselinePassed: true,
          layer2CandidateAuthoredPassed: true,
          layer2CandidateAuthoredCount: 0,
          layer3AdversarialPassed: true,
          layer4MetamorphicPassed: true,
          oracleIndependenceSatisfied: true,
        },
        regressions: [],
        score: 120,
      };

      const candidateB: VerificationResult = {
        ...candidateA,
        candidateId: "cand-B",
        softMetrics: {
          ...candidateA.softMetrics,
          evidenceStrength: 0.65, // Only verified by basic tests, no adversarial or metamorphic verification
          confidenceScore: 0.65,
        },
      };

      // Candidate A should Pareto-dominate Candidate B because of higher evidenceStrength
      expect(dominates(candidateA, candidateB)).toBe(true);
      expect(dominates(candidateB, candidateA)).toBe(false);
    });
  });

  describe("3. DPO Trajectory 4-Classification & Negative Pollution Prevention", () => {
    it("excludes VALID_ALTERNATIVE from DPO negative preference pairs", () => {
      const exporter = new TrajectoryExporter();

      const fakeContext = {
        runId: "run-dpo-test",
        goal: "Refactor core event loop",
        iteration: 1,
        winner: {
          implementation: {
            candidateId: "cand-winner",
            level: "subsystem",
            worktreePath: "/tmp/winner",
            branchName: "branch-winner",
          },
          verification: {
            score: 150,
            softMetrics: { evidenceStrength: 0.95 },
            hardGates: { passedAll: true },
            tests: { passed: 10, failed: 0 },
            metamorphic: { passed: true },
            regressions: [],
          },
        },
        candidateQueue: [
          {
            implementation: {
              candidateId: "cand-alt",
              level: "module",
              worktreePath: "/tmp/alt",
              branchName: "branch-alt",
            },
            verification: {
              score: 140,
              softMetrics: { evidenceStrength: 0.90 },
              hardGates: { passedAll: true },
              tests: { passed: 10, failed: 0 },
              regressions: [],
            },
          },
        ],
        implementations: [
          { candidateId: "cand-winner", level: "subsystem", branchName: "branch-winner" },
          { candidateId: "cand-alt", level: "module", branchName: "branch-alt" },
          { candidateId: "cand-broken", level: "local", branchName: "branch-broken" },
        ],
        verifications: [
          {
            candidateId: "cand-winner",
            score: 150,
            softMetrics: { evidenceStrength: 0.95 },
            hardGates: { passedAll: true },
            tests: { passed: 10, failed: 0 },
            regressions: [],
          },
          {
            candidateId: "cand-alt",
            score: 140,
            softMetrics: { evidenceStrength: 0.90 },
            hardGates: { passedAll: true },
            tests: { passed: 10, failed: 0 },
            regressions: [],
          },
          {
            candidateId: "cand-broken",
            score: -50,
            softMetrics: { evidenceStrength: 0.0 },
            hardGates: { passedAll: false, failureReasons: ["Compilation failure"] },
            tests: { passed: 0, failed: 2 },
            regressions: ["Compilation failure"],
          },
        ],
      } as unknown as HarnessContext;

      const trajectory = exporter.buildTrajectory(fakeContext);

      // Verify dispositions
      const winnerRecord = trajectory.candidates.find((c) => c.candidateId === "cand-winner");
      const altRecord = trajectory.candidates.find((c) => c.candidateId === "cand-alt");
      const brokenRecord = trajectory.candidates.find((c) => c.candidateId === "cand-broken");

      expect(winnerRecord?.disposition).toBe("WINNER");
      expect(altRecord?.disposition).toBe("VALID_ALTERNATIVE");
      expect(brokenRecord?.disposition).toBe("REJECTED_REGRESSION");

      // Verify that VALID_ALTERNATIVE is NOT in preference pairs!
      // Only cand-broken should be present as a HARD_NEGATIVE
      expect(trajectory.preferencePairs).toHaveLength(1);
      const pair = trajectory.preferencePairs[0];
      expect(pair.rejected.candidateId).toBe("cand-broken");
      expect(pair.pairType).toBe("HARD_NEGATIVE");
      expect(pair.rejected.disposition).toBe("REJECTED_REGRESSION");
    });
  });

  describe("4. Negative Memory & DO NOT Constraints Injection", () => {
    it("distinguishes positive memories from negative constraints in diagnosis prompt context", () => {
      const compactor = new ContextCompactor();

      const fakeContext = {
        runId: "run-mem-test",
        goal: "Fix thread contention in worker pool",
        distilledLessons: [
          {
            iteration: 1,
            source: "CleanRoomReview",
            lesson: "Do not use global synchronized block; causes deadlock across workers",
            violatedInvariant: "Concurrency deadlock free",
          },
        ],
        rejectionFeedbacks: [],
        recalledMemories: [
          {
            id: "mem-neg-1",
            type: "negative_constraint",
            title: "Prohibited global state",
            content: "DO NOT: introduce mutable global singleton. Reason: causes race conditions in parallel tests.",
            tags: "negative",
            createdAt: new Date().toISOString(),
            rank: -1,
          },
          {
            id: "mem-pos-1",
            type: "adr",
            title: "ADR-0004: Event Driven Architecture",
            content: "Use message channels to decouple worker tasks.",
            tags: "adr",
            createdAt: new Date().toISOString(),
            rank: -2,
          },
        ],
        activeSkills: [],
      } as unknown as HarnessContext;

      const promptContext = compactor.buildDiagnosisPromptContext(fakeContext);
      expect(promptContext).toBeDefined();

      // Check for structured negative constraints section
      expect(promptContext).toContain("CRITICAL NEGATIVE CONSTRAINTS (DO NOT REPEAT PREVIOUS ARCHITECTURAL FLAWS / ANTI-PATTERNS):");
      expect(promptContext).toContain("DO NOT: introduce mutable global singleton");
      expect(promptContext).toContain("Do not use global synchronized block; causes deadlock across workers");

      // Check for positive memories section
      expect(promptContext).toContain("HISTORICAL ARCHITECTURAL DECISIONS & INVARIANTS:");
      expect(promptContext).toContain("ADR-0004: Event Driven Architecture");
    });

    it("indexes negative constraint into SQLite FTS5 memory", () => {
      const memoryManager = new DurableMemoryManager({ dbPath: ":memory:" });
      memoryManager.recordNegativeConstraint(
        "run-123",
        "cand-lock",
        "Spinlock polling in event loop",
        "Causes 100% CPU lockup"
      );

      const recalled = memoryManager.searchMemories("Spinlock polling");
      expect(recalled.length).toBeGreaterThan(0);
      expect(recalled[0].type).toBe("negative_constraint");
      expect(recalled[0].content).toContain("DO NOT: Spinlock polling in event loop");
      memoryManager.close();
    });
  });
});
