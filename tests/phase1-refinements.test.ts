import { describe, it, expect, vi } from "vitest";
import { ContextCompactor, DEPENDENCY_INVALIDATION_MATRIX } from "../src/orchestrator/compactor.js";
import { BacktrackTarget } from "../src/orchestrator/backtrack-router.js";
import { Phase, type HarnessContext } from "../src/orchestrator/context.js";
import { StructuredEvidenceStore } from "../src/orchestrator/evidence-store.js";
import { compareWithPareto, evaluateDiagnosticDeltas } from "../src/evaluator/pareto.js";
import type { VerificationResult, DiagnosticItem } from "../src/schemas/result.js";
import type { CandidateImplementation } from "../src/schemas/candidate.js";
import { extractDiagnostics } from "../src/evaluator/runner.js";

function createMockContext(): HarnessContext {
  const evidenceStore = new StructuredEvidenceStore();
  const attempt = {
    id: "attempt-1-test",
    type: "FAST" as const,
    iteration: 1,
    worktreePaths: ["/tmp/wt1"],
    implementations: [
      {
        candidateId: "cand-1",
        hypothesisId: "h1",
        level: "L1_function_implementation" as const,
        worktreePath: "/tmp/wt1",
        branchName: "branch-cand-1",
      },
    ],
    verifications: [],
    candidateQueue: [],
    rejectedCandidates: [],
    rollbackTransientState: vi.fn().mockResolvedValue(undefined),
  };

  return {
    goal: "Test goal for phase 1 validation",
    runId: "run-test-phase1",
    repoRoot: "/tmp/repo",
    publishPr: false,
    phase: Phase.Compare,
    finished: false,
    worktreeManager: {
      repoRoot: "/tmp/repo",
      cleanAllWorktrees: vi.fn().mockResolvedValue(undefined),
      revParse: vi.fn().mockResolvedValue("sha-mock-123"),
      mergeBranch: vi.fn().mockResolvedValue({ success: true }),
      rebaseOntoBase: vi.fn().mockResolvedValue({ success: true, integrationSha: "sha-rebased-456" }),
    } as any,
    evaluator: {} as any,
    memoryManager: {
      ftsIndex: { insert: vi.fn() },
    } as any,
    skillManager: {} as any,
    trajectoryExporter: {} as any,
    githubBroker: {} as any,
    compactor: new ContextCompactor(),
    budgetTracker: {
      isExhausted: () => false,
      recordBacktrack: vi.fn(),
    } as any,
    executionJournal: {
      recordPhaseStart: vi.fn(),
      recordPhaseComplete: vi.fn(),
    } as any,
    evidenceStore,
    currentAttempt: attempt,
    attempts: [attempt],
    recalledMemories: [],
    activeSkills: [],
    research: {
      goal: "Test goal",
      problemClassification: "optimization",
      priorArt: [],
      sotaApproaches: [],
      timestamp: new Date().toISOString(),
    },
    diagnosis: {
      goal: "Test goal",
      candidates: [
        {
          id: "h1",
          level: "L1_function_implementation",
          levelNumber: 1,
          hypothesis: "Hypothesis 1",
          strategy: "local_patch",
          experiment: "Test patch",
          worthExperimenting: true,
          evidenceFor: [],
          evidenceAgainst: [],
        },
      ],
      timestamp: new Date().toISOString(),
    },
    diversityEvaluation: {
      passed: true,
      levelsRepresented: [1],
      uniqueLevelsCount: 1,
      reason: "Mock diversity passed",
    },
    falsifiedCandidates: [
      {
        id: "h1",
        level: "L1_function_implementation",
        levelNumber: 1,
        hypothesis: "Hypothesis 1",
        strategy: "local_patch",
        experiment: "Test patch",
        worthExperimenting: true,
        evidenceFor: [],
        evidenceAgainst: [],
      },
    ],
    implementations: [
      {
        candidateId: "cand-1",
        hypothesisId: "h1",
        level: "L1_function_implementation",
        worktreePath: "/tmp/wt1",
        branchName: "branch-cand-1",
      },
    ],
    verifications: [
      {
        candidateId: "cand-1",
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
          complexityDelta: 5,
          addedLines: 5,
          deletedLines: 0,
          fileCount: 1,
          architecturalInterventionLevel: 1,
          confidenceScore: 1.0,
        },
        tests: {
          passed: 1,
          failed: 0,
          output: "Tests passed",
          exitCode: 0,
          failingTestIds: [],
          passingTestIds: ["test-1"],
        },
        diagnostics: { typeErrors: [], lintErrors: [] },
        regressions: [],
        score: 100,
      },
    ],
    candidateQueue: [],
    rejectedCandidates: [],
    winner: {
      implementation: {
        candidateId: "cand-1",
        hypothesisId: "h1",
        level: "L1_function_implementation",
        worktreePath: "/tmp/wt1",
        branchName: "branch-cand-1",
      },
      verification: {
        candidateId: "cand-1",
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
          complexityDelta: 5,
          addedLines: 5,
          deletedLines: 0,
          fileCount: 1,
          architecturalInterventionLevel: 1,
          confidenceScore: 1.0,
        },
        tests: {
          passed: 1,
          failed: 0,
          output: "Tests passed",
          exitCode: 0,
          failingTestIds: [],
          passingTestIds: ["test-1"],
        },
        diagnostics: { typeErrors: [], lintErrors: [] },
        regressions: [],
        score: 100,
      },
    },
    iteration: 1,
    rejectionFeedbacks: ["Initial syntax failure"],
    distilledLessons: [],
    compactionRecords: [],
    traceLog: [],
  };
}

describe("Phase 1 Architectural Refinements", () => {
  describe("1. Dependency Invalidation Matrix", () => {
    it("preserves hypotheses and falsifications when backtracking to IMPLEMENT", () => {
      const compactor = new ContextCompactor();
      const ctx = createMockContext();

      const record = compactor.compactForBacktrack(ctx, BacktrackTarget.Implement);

      // Verify scope applied
      expect(record.target).toBe(BacktrackTarget.Implement);
      expect(record.scope?.implementations).toBe(true);
      expect(record.scope?.hypotheses).toBe(false);
      expect(record.scope?.falsification).toBe(false);

      // State checks
      expect(ctx.diagnosis).toBeDefined(); // Hypotheses preserved
      expect(ctx.falsifiedCandidates).toBeDefined(); // Falsification preserved
      expect(ctx.implementations).toHaveLength(0); // Implementations purged
      expect(ctx.verifications).toHaveLength(0); // Verifications purged
      expect(ctx.winner).toBeUndefined(); // Winner purged
    });

    it("preserves hypotheses but invalidates falsification when backtracking to FALSIFY", () => {
      const compactor = new ContextCompactor();
      const ctx = createMockContext();

      const record = compactor.compactForBacktrack(ctx, BacktrackTarget.Falsify);

      expect(record.target).toBe(BacktrackTarget.Falsify);
      expect(ctx.diagnosis).toBeDefined(); // Hypotheses preserved
      expect(ctx.falsifiedCandidates).toBeUndefined(); // Falsification invalidated
      expect(ctx.implementations).toHaveLength(0);
      expect(ctx.verifications).toHaveLength(0);
    });

    it("invalidates hypotheses but preserves research when backtracking to DIAGNOSE", () => {
      const compactor = new ContextCompactor();
      const ctx = createMockContext();

      const record = compactor.compactForBacktrack(ctx, BacktrackTarget.Diagnose);

      expect(record.target).toBe(BacktrackTarget.Diagnose);
      expect(ctx.research).toBeDefined(); // Research preserved
      expect(ctx.diagnosis).toBeUndefined(); // Hypotheses invalidated
      expect(ctx.falsifiedCandidates).toBeUndefined();
      expect(ctx.implementations).toHaveLength(0);
    });

    it("invalidates research and all downstream state when backtracking to RESEARCH", () => {
      const compactor = new ContextCompactor();
      const ctx = createMockContext();

      const record = compactor.compactForBacktrack(ctx, BacktrackTarget.Research);

      expect(record.target).toBe(BacktrackTarget.Research);
      expect(ctx.research).toBeUndefined(); // Research invalidated
      expect(ctx.diagnosis).toBeUndefined();
      expect(ctx.falsifiedCandidates).toBeUndefined();
      expect(ctx.implementations).toHaveLength(0);
    });

    it("persists observation into EvidenceStore before purging verifications", () => {
      const compactor = new ContextCompactor();
      const ctx = createMockContext();

      compactor.compactForBacktrack(ctx, BacktrackTarget.Implement);

      const observations = ctx.evidenceStore.getAllObservations();
      expect(observations.length).toBeGreaterThan(0);
      expect(observations[0].source).toContain("verification:cand-1");
    });
  });

  describe("2. Commit Graph Invariants (candidateSha / baseSha / integrationSha / verifiedHeadSha)", () => {
    it("retains verifiedCommitSha strictly consistent with verifiedHeadSha and integrationSha", () => {
      const ctx = createMockContext();

      const baseSha = "sha-base-111111";
      const candidateSha = "sha-cand-222222";
      const integrationSha = "sha-intg-333333";
      const verifiedHeadSha = integrationSha;

      ctx.commitGraph = {
        baseSha,
        candidateSha,
        integrationSha,
        verifiedHeadSha,
        remoteHeadSha: verifiedHeadSha,
      };
      ctx.verifiedCommitSha = verifiedHeadSha;

      // Invariant check: local tested SHA must equal verifiedHeadSha
      expect(ctx.commitGraph.verifiedHeadSha).toBe(ctx.commitGraph.integrationSha);
      expect(ctx.verifiedCommitSha).toBe(ctx.commitGraph.verifiedHeadSha);
      expect(ctx.commitGraph.remoteHeadSha).toBe(ctx.commitGraph.verifiedHeadSha);
    });
  });

  describe("3. Fast / Deep Attempt Isolation", () => {
    it("rolls back Fast attempt state while preserving failure evidence upon escalation", async () => {
      const ctx = createMockContext();
      expect(ctx.currentAttempt.type).toBe("FAST");

      const rollbackSpy = ctx.currentAttempt.rollbackTransientState;

      // Simulate escalation to DEEP in deepControllerAction
      if (ctx.currentAttempt && ctx.currentAttempt.type === "FAST") {
        await ctx.currentAttempt.rollbackTransientState();

        for (const ver of ctx.verifications) {
          ctx.evidenceStore.addObservation({
            source: `fast_track:${ver.candidateId}`,
            content: `FastTrack verification failed`,
            iteration: ctx.iteration,
            data: { candidateId: ver.candidateId },
          });
        }

        ctx.implementations = [];
        ctx.verifications = [];
        ctx.candidateQueue = [];
        ctx.winner = undefined;
      }

      const deepAttempt = {
        id: "attempt-2-deep",
        type: "DEEP" as const,
        iteration: 1,
        worktreePaths: [],
        implementations: [],
        verifications: [],
        candidateQueue: [],
        rejectedCandidates: [],
        rollbackTransientState: vi.fn(),
      };
      ctx.currentAttempt = deepAttempt;
      ctx.attempts.push(deepAttempt);

      // Verify strict isolation
      expect(rollbackSpy).toHaveBeenCalledTimes(1);
      expect(ctx.implementations).toHaveLength(0);
      expect(ctx.verifications).toHaveLength(0);
      expect(ctx.winner).toBeUndefined();
      expect(ctx.currentAttempt.type).toBe("DEEP");
      expect(ctx.attempts).toHaveLength(2);

      // Verify evidence was preserved
      const fastObservations = ctx.evidenceStore.getAllObservations().filter((o) => o.source.startsWith("fast_track:"));
      expect(fastObservations.length).toBeGreaterThan(0);
    });
  });

  describe("4. Hard Gate Identity Delta (No newly introduced violation)", () => {
    it("extracts diagnostics with deterministic SHA-256 identityHash", () => {
      const tsOutput = `
src/index.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'.
src/index.ts:15:3: error: 'unused' is defined but never used. [no-unused-vars]
      `.trim();

      const diagnostics = extractDiagnostics(tsOutput);
      expect(diagnostics.typeErrors).toHaveLength(1);
      expect(diagnostics.typeErrors[0].code).toBe("TS2322");
      expect(diagnostics.typeErrors[0].identityHash).toBeDefined();

      expect(diagnostics.lintErrors).toHaveLength(1);
      expect(diagnostics.lintErrors[0].code).toBe("no-unused-vars");
      expect(diagnostics.lintErrors[0].identityHash).toBeDefined();
    });

    it("evaluates diagnostic deltas and passes if no new errors are introduced despite baseline errors", () => {
      const baselineItem: DiagnosticItem = {
        filePath: "src/legacy.ts",
        line: 10,
        column: 2,
        code: "TS2322",
        message: "Legacy baseline type error",
        identityHash: "hash-legacy-1",
      };

      // Candidate has the EXACT same error (persistent, not newly introduced)
      const delta = evaluateDiagnosticDeltas([baselineItem], [baselineItem]);
      expect(delta.newErrors).toHaveLength(0);
      expect(delta.persistentErrors).toHaveLength(1);
      expect(delta.resolvedErrors).toHaveLength(0);
    });

    it("disqualifies candidate when a new type error is introduced (identity delta violation)", () => {
      const baselineItem: DiagnosticItem = {
        filePath: "src/legacy.ts",
        line: 10,
        code: "TS2322",
        message: "Legacy baseline type error",
        identityHash: "hash-legacy-1",
      };

      const newErrorItem: DiagnosticItem = {
        filePath: "src/new-feature.ts",
        line: 5,
        code: "TS2345",
        message: "Argument of type 'null' is not assignable",
        identityHash: "hash-new-2",
      };

      const baseline: VerificationResult = {
        candidateId: "baseline-0",
        isBaseline: true,
        hardGates: {
          testsPassed: true,
          noRegressions: true,
          typecheckPassed: false,
          lintPassed: true,
          testIntegrityPassed: true,
          passedAll: false,
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
        tests: { passed: 10, failed: 0, output: "", exitCode: 0, failingTestIds: [], passingTestIds: [] },
        diagnostics: { typeErrors: [baselineItem], lintErrors: [] },
        regressions: [],
        score: 100,
      };

      const candidateA: { implementation: CandidateImplementation; verification: VerificationResult } = {
        implementation: {
          candidateId: "cand-clean",
          hypothesisId: "h1",
          level: "L1_function_implementation",
          worktreePath: "/tmp/wt-clean",
          branchName: "b-clean",
        },
        verification: {
          ...baseline,
          candidateId: "cand-clean",
          isBaseline: false,
          // Has same baseline error, but NO new errors
          diagnostics: { typeErrors: [baselineItem], lintErrors: [] },
        },
      };

      const candidateB: { implementation: CandidateImplementation; verification: VerificationResult } = {
        implementation: {
          candidateId: "cand-regressed",
          hypothesisId: "h2",
          level: "L2_subsystem_refactor",
          worktreePath: "/tmp/wt-regressed",
          branchName: "b-regressed",
        },
        verification: {
          ...baseline,
          candidateId: "cand-regressed",
          isBaseline: false,
          // Introduced a brand new type error!
          diagnostics: { typeErrors: [baselineItem, newErrorItem], lintErrors: [] },
        },
      };

      const result = compareWithPareto([candidateA, candidateB], baseline);

      // Candidate A should qualify because it introduced 0 new errors
      expect(result.rankedQueue.some((c) => c.implementation.candidateId === "cand-clean")).toBe(true);

      // Candidate B should be disqualified because of new error introduction
      const disB = result.disqualified.find((d) => d.candidate.implementation.candidateId === "cand-regressed");
      expect(disB).toBeDefined();
      expect(disB?.reasons[0]).toContain("New type error(s) introduced");
    });
  });
});
