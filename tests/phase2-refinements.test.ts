import { describe, it, expect, vi } from "vitest";
import {
  FourTierVerificationRunner,
  MetamorphicOracleRunner,
  type AcceptanceCriterion,
  type AdversarialScenario,
} from "../src/evaluator/oracle.js";
import {
  routeBacktrack,
  BacktrackTarget,
} from "../src/orchestrator/backtrack-router.js";
import {
  createAndSaveVerifiedMemory,
  promoteMemoryProvenance,
  PROVENANCE_HIERARCHY,
  PROVENANCE_CONFIDENCE_WEIGHTS,
  type VerifiedMemoryRecord,
} from "../src/memory/verified-memory.js";
import { StructuredEvidenceStore } from "../src/orchestrator/evidence-store.js";
import { Evaluator } from "../src/evaluator/runner.js";

describe("Phase 2 Architectural Refinements", () => {
  describe("1. Four-Tier Independent Verification Oracle", () => {
    it("evaluates Tier 2 Acceptance Oracle independently of implementation code", async () => {
      const runner = new FourTierVerificationRunner();
      const criteria: AcceptanceCriterion[] = [
        {
          id: "acc-1",
          description: "Must contain JSON output in test results",
          evaluate: ({ testOutput }) => testOutput.includes('"status": "ok"'),
        },
        {
          id: "acc-2",
          description: "Must execute without database lock timeouts",
          evaluate: ({ testOutput }) => !testOutput.includes("SQLITE_BUSY"),
        },
      ];

      // Case A: Passes all acceptance criteria
      const passResult = await runner.evaluateAcceptance(criteria, {
        worktreePath: "/tmp/wt",
        testOutput: 'All tests passed. {"status": "ok"}',
      });
      expect(passResult.tested).toBe(true);
      expect(passResult.passed).toBe(true);
      expect(passResult.verifiedCriteria).toHaveLength(2);
      expect(passResult.missingCriteria).toHaveLength(0);

      // Case B: Fails missing criterion
      const failResult = await runner.evaluateAcceptance(criteria, {
        worktreePath: "/tmp/wt",
        testOutput: "All tests passed. SQLITE_BUSY error encountered.",
      });
      expect(failResult.tested).toBe(true);
      expect(failResult.passed).toBe(false);
      expect(failResult.missingCriteria).toContain("Must execute without database lock timeouts");
    });

    it("evaluates Tier 3 Hidden Adversarial Scenarios and surfaces failures", async () => {
      const runner = new FourTierVerificationRunner();
      const scenarios: AdversarialScenario[] = [
        {
          id: "adv-boundary",
          description: "Test boundary input: zero and negative limits",
          type: "boundary_condition",
          run: async () => ({ passed: true }),
        },
        {
          id: "adv-concurrency",
          description: "Test high-concurrency race condition",
          type: "concurrency_race",
          run: async () => ({ passed: false, reason: "Deadlock detected under 100 parallel workers" }),
        },
      ];

      const res = await runner.evaluateAdversarial(scenarios, { worktreePath: "/tmp/wt" });
      expect(res.tested).toBe(true);
      expect(res.passed).toBe(false);
      expect(res.scenarios["adv-boundary"]).toBe(true);
      expect(res.scenarios["adv-concurrency"]).toBe(false);
      expect(res.failureReasons[0]).toContain("Deadlock detected under 100 parallel workers");
    });

    it("evaluates Tier 4 Metamorphic / Algebraic Invariants (Idempotence & Round-trip)", async () => {
      const runner = new FourTierVerificationRunner();

      // Test idempotence property: f(f(x)) === f(x)
      const trimFn = (s: string) => s.trim();
      const propIdempotence = MetamorphicOracleRunner.createIdempotenceProperty(
        "string_trim_idempotence",
        trimFn,
        "   hello world   "
      );

      // Test round-trip property: decode(encode(x)) === x
      const encode = (obj: any) => JSON.stringify(obj);
      const decode = (str: string) => JSON.parse(str);
      const sample = { id: 123, name: "test-round-trip" };
      const propRoundTrip = MetamorphicOracleRunner.createRoundTripProperty(
        "json_round_trip",
        encode,
        decode,
        sample
      );

      const res = await runner.evaluateMetamorphic(null, [propIdempotence, propRoundTrip]);
      expect(res.tested).toBe(true);
      expect(res.passed).toBe(true);
      expect(res.properties["string_trim_idempotence"]).toBe(true);
      expect(res.properties["json_round_trip"]).toBe(true);
    });
  });

  describe("2. Backtrack Router Evidence & Confidence Tracking", () => {
    it("returns high-confidence BacktrackDecision with failureClass and evidenceIds for structured error", () => {
      const evidenceIds = ["ev-obs-101", "ev-obs-102"];
      const decision = routeBacktrack(
        ["Deadlock detected in worker pool"],
        "ROOT_CAUSE_ERROR",
        { evidenceIds }
      );

      expect(decision.target).toBe(BacktrackTarget.Diagnose);
      expect(decision.failureClass).toBe("ROOT_CAUSE_ERROR");
      expect(decision.confidence).toBe(0.95);
      expect(decision.evidenceIds).toEqual(evidenceIds);
    });

    it("returns pattern-matched decision with medium confidence when structured failureClass is missing", () => {
      const evidenceIds = ["ev-obs-201"];
      const decision = routeBacktrack(
        ["error TS2322: syntax error in code near line 5"],
        undefined,
        { evidenceIds }
      );

      expect(decision.target).toBe(BacktrackTarget.Implement);
      expect(decision.failureClass).toBe("IMPLEMENTATION_ERROR");
      expect(decision.confidence).toBe(0.80);
      expect(decision.evidenceIds).toEqual(evidenceIds);
    });

    it("routes external library mismatch to Research with EXTERNAL_SPEC failureClass", () => {
      const decision = routeBacktrack(["external library API spec changed in v3.0, unsupported call"]);
      expect(decision.target).toBe(BacktrackTarget.Research);
      expect(decision.failureClass).toBe("EXTERNAL_SPEC");
      expect(decision.confidence).toBe(0.80);
    });
  });

  describe("3. Memory Verification Lifecycle (Promotion Ladder)", () => {
    it("progresses monotonically through promotion ladder with increasing confidence weights", async () => {
      const mockMemoryManager = {
        saveArtifact: vi.fn().mockResolvedValue(undefined),
        ftsIndex: { insert: vi.fn() },
      } as any;

      // 1. Initial creation at CLEANROOM_APPROVED
      const record: VerifiedMemoryRecord = {
        id: "mem-test-ladder",
        runId: "run-ladder-1",
        claim: "Lock-free queue solution verified",
        provenance: "CLEANROOM_APPROVED",
        evidence: {
          testsPassed: 5,
          testsFailed: 0,
          exitCode: 0,
          regressionsDetected: 0,
          addedLines: 20,
          deletedLines: 5,
        },
        repo: "my_harness",
        commitHash: "branch-q",
        candidateId: "cand-q",
        interventionLevel: "L2_subsystem_refactor",
        confidence: PROVENANCE_CONFIDENCE_WEIGHTS["CLEANROOM_APPROVED"],
        validityScope: "repo",
        verifiedAt: new Date().toISOString(),
      };

      expect(record.confidence).toBe(0.7);

      // 2. Promote to LOCAL_INTEGRATION_VERIFIED
      await promoteMemoryProvenance({
        record,
        newProvenance: "LOCAL_INTEGRATION_VERIFIED",
        memoryManager: mockMemoryManager,
        reason: "Integration tests passed on unified SHA",
      });

      expect(record.provenance).toBe("LOCAL_INTEGRATION_VERIFIED");
      expect(record.confidence).toBe(0.8);
      expect(mockMemoryManager.saveArtifact).toHaveBeenCalledTimes(1);

      // 3. Promote to PR_CREATED
      await promoteMemoryProvenance({
        record,
        newProvenance: "PR_CREATED",
        memoryManager: mockMemoryManager,
        reason: "PR created on remote GitHub",
      });

      expect(record.provenance).toBe("PR_CREATED");
      expect(record.confidence).toBe(0.85);

      // 4. Promote to MERGED
      await promoteMemoryProvenance({
        record,
        newProvenance: "MERGED",
        memoryManager: mockMemoryManager,
        reason: "Merged into main branch",
      });

      expect(record.provenance).toBe("MERGED");
      expect(record.confidence).toBe(1.0);

      // 5. Monotonicity: Attempting to demote to MACHINE_VERIFIED must be rejected
      await promoteMemoryProvenance({
        record,
        newProvenance: "MACHINE_VERIFIED",
        memoryManager: mockMemoryManager,
      });

      // Still MERGED, never demoted
      expect(record.provenance).toBe("MERGED");
      expect(record.confidence).toBe(1.0);
    });
  });
});
