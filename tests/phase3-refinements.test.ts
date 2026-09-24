import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { ExecutionJournal } from "../src/journal/execution-journal.js";
import { DurableMemoryManager } from "../src/memory/durable-memory.js";
import { WorktreeManager } from "../src/git/worktree.js";
import { reconcileRun, applyReconciledStateToContext } from "../src/journal/reconciliation.js";
import {
  AdaptiveHypothesisScheduler,
  computeBinaryEntropy,
  estimateHypothesisCost,
} from "../src/phases/adaptive-scheduler.js";
import type { CandidateHypothesis } from "../src/schemas/diagnosis.js";
import { HarnessOrchestrator } from "../src/orchestrator/orchestrator.js";
import { Phase } from "../src/orchestrator/context.js";

describe("Phase 3 Architectural Refinements", () => {
  let tmpDir: string;
  let journalDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "phase3-test-"));
    journalDir = path.join(tmpDir, ".agent", "journal");
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("1. Crash Recovery & Reconciliation (Retry + Idempotency)", () => {
    it("reconciles crashed run by identifying last completed phase and calculating next phase", async () => {
      const journal = new ExecutionJournal(journalDir);
      const memoryManager = new DurableMemoryManager({ repoRoot: tmpDir });
      const worktreeManager = new WorktreeManager({ repoRoot: tmpDir });
      const runId = "run-crash-test-1";

      // Simulate execution up to Diagnose completion, then crash during Implement
      await journal.recordPhaseStart(runId, "Inspect", 1);
      await journal.recordPhaseComplete(runId, "Inspect", 1);
      await journal.recordPhaseStart(runId, "Triage", 1);
      await journal.recordPhaseComplete(runId, "Triage", 1);
      await journal.recordPhaseStart(runId, "Diagnose", 1);
      await journal.recordPhaseComplete(runId, "Diagnose", 1);
      await journal.recordPhaseStart(runId, "Implement", 1);
      // Crashed here without recordPhaseComplete!

      // Simulate saved artifacts from completed phases
      await memoryManager.saveArtifact(runId, "diagnosis.json", {
        candidates: [
          {
            id: "cand-1",
            level: "L1_function_implementation",
            hypothesis: "Test hypothesis",
            experiment: "Test experiment",
          },
        ],
      });

      const reconciled = await reconcileRun({
        runId,
        journal,
        worktreeManager,
        memoryManager,
      });

      expect(reconciled.runId).toBe(runId);
      expect(reconciled.resumable).toBe(true);
      expect(reconciled.lastCompletedPhase).toBe("Diagnose");
      expect(reconciled.nextPhase).toBe(Phase.DiversityGate);
      expect(reconciled.recoveredArtifacts).toContain("diagnosis.json");
    });

    it("restores recovered artifacts into Blackboard context seamlessly", async () => {
      const journal = new ExecutionJournal(journalDir);
      const memoryManager = new DurableMemoryManager({ repoRoot: tmpDir });
      const worktreeManager = new WorktreeManager({ repoRoot: tmpDir });
      const runId = "run-crash-test-2";

      await journal.recordPhaseStart(runId, "Inspect", 1);
      await journal.recordPhaseComplete(runId, "Inspect", 1);
      await journal.recordPhaseStart(runId, "Diagnose", 1);
      await journal.recordPhaseComplete(runId, "Diagnose", 1);

      const fakeDiagnosis = {
        candidates: [
          {
            id: "cand-recover",
            level: "L2_module_responsibility" as const,
            hypothesis: "Recovered hypothesis",
            experiment: "verify recovery",
            worthExperimenting: true,
            evidenceFor: [],
            evidenceAgainst: [],
          },
        ],
      };
      await memoryManager.saveArtifact(runId, "diagnosis.json", fakeDiagnosis);

      const reconciled = await reconcileRun({
        runId,
        journal,
        worktreeManager,
        memoryManager,
      });

      const orch = new HarnessOrchestrator({
        goal: "Test recovery",
        repoRoot: tmpDir,
      });

      // Apply reconciled state to orchestrator context
      await applyReconciledStateToContext(reconciled, orch.context);

      expect(orch.context.phase).toBe(Phase.DiversityGate);
      expect(orch.context.diagnosis).toBeDefined();
      expect(orch.context.diagnosis?.candidates[0].id).toBe("cand-recover");
      expect(orch.context.evidenceStore.getAllObservations().length).toBeGreaterThan(0);
      expect(orch.context.evidenceStore.getAllObservations()[0].source).toBe("reconciliation:crash_recovery");
    });

    it("handles fresh or finished runs gracefully without unneeded resumption", async () => {
      const journal = new ExecutionJournal(journalDir);
      const memoryManager = new DurableMemoryManager({ repoRoot: tmpDir });
      const worktreeManager = new WorktreeManager({ repoRoot: tmpDir });

      // Fresh empty run
      const freshReconciled = await reconcileRun({
        runId: "run-fresh",
        journal,
        worktreeManager,
        memoryManager,
      });
      expect(freshReconciled.resumable).toBe(false);
      expect(freshReconciled.nextPhase).toBe(Phase.Inspect);

      // Finished run
      await journal.recordPhaseStart("run-finished", "Finished", 1);
      await journal.recordPhaseComplete("run-finished", "Finished", 1);

      const finishedReconciled = await reconcileRun({
        runId: "run-finished",
        journal,
        worktreeManager,
        memoryManager,
      });
      expect(finishedReconciled.resumable).toBe(false);
      expect(finishedReconciled.nextPhase).toBe(Phase.Finished);
    });
  });

  describe("2. Adaptive Hypothesis Scheduling (Bayesian E[InfoGain] / Cost)", () => {
    it("computes Shannon entropy correctly (max uncertainty at p=0.5, zero at p=0 and p=1)", () => {
      expect(computeBinaryEntropy(0.5)).toBeCloseTo(1.0, 5);
      expect(computeBinaryEntropy(0.0)).toBe(0);
      expect(computeBinaryEntropy(1.0)).toBe(0);
      expect(computeBinaryEntropy(0.2)).toBeCloseTo(computeBinaryEntropy(0.8), 5);
      expect(computeBinaryEntropy(0.5)).toBeGreaterThan(computeBinaryEntropy(0.8));
    });

    it("estimates cost monotonically increasing with architectural intervention level", () => {
      const l0: CandidateHypothesis = {
        id: "c0",
        level: "L0_configuration_typo",
        hypothesis: "Typo fix",
        experiment: "lint",
        worthExperimenting: true,
        evidenceFor: [],
        evidenceAgainst: [],
      };
      const l1: CandidateHypothesis = { ...l0, id: "c1", level: "L1_function_implementation" };
      const l3: CandidateHypothesis = { ...l0, id: "c3", level: "L3_interface_api" };
      const l6: CandidateHypothesis = { ...l0, id: "c6", level: "L6_architecture" };

      expect(estimateHypothesisCost(l0)).toBeLessThan(estimateHypothesisCost(l1));
      expect(estimateHypothesisCost(l1)).toBeLessThan(estimateHypothesisCost(l3));
      expect(estimateHypothesisCost(l3)).toBeLessThan(estimateHypothesisCost(l6));
    });

    it("prioritizes cheap high-uncertainty hypotheses over expensive low-uncertainty ones", () => {
      const cheapHypothesis: CandidateHypothesis = {
        id: "cheap-uncertain",
        level: "L1_function_implementation", // cost = 5s
        confidence: 0.5, // max entropy = 1.0 bit
        hypothesis: "Local fix",
        experiment: "test",
        worthExperimenting: true,
        evidenceFor: [],
        evidenceAgainst: [],
      };

      const expensiveHypothesis: CandidateHypothesis = {
        id: "expensive-certain",
        level: "L6_architecture", // cost = 90s
        confidence: 0.9, // low entropy ~0.47 bit
        hypothesis: "Architecture rewrite",
        experiment: "rebuild",
        worthExperimenting: true,
        evidenceFor: [],
        evidenceAgainst: [],
      };

      const scheduler = new AdaptiveHypothesisScheduler([expensiveHypothesis, cheapHypothesis]);
      const schedule = scheduler.getPrioritizedSchedule();

      expect(schedule.length).toBe(2);
      expect(schedule[0].hypothesisId).toBe("cheap-uncertain");
      expect(schedule[1].hypothesisId).toBe("expensive-certain");
      expect(schedule[0].efficiencyScore).toBeGreaterThan(schedule[1].efficiencyScore);
    });

    it("performs Bayesian belief update and correlated dampening upon falsification", () => {
      const candA: CandidateHypothesis = {
        id: "cand-A",
        level: "L3_interface_api",
        confidence: 0.5,
        hypothesis: "Interface redesign A",
        experiment: "test",
        worthExperimenting: true,
        evidenceFor: [],
        evidenceAgainst: [],
      };
      const candB: CandidateHypothesis = {
        id: "cand-B",
        level: "L3_interface_api", // Same level!
        confidence: 0.5,
        hypothesis: "Interface redesign B",
        experiment: "test",
        worthExperimenting: true,
        evidenceFor: [],
        evidenceAgainst: [],
      };

      const scheduler = new AdaptiveHypothesisScheduler([candA, candB]);

      // Record falsification of Cand A
      scheduler.recordExperimentOutcome("cand-A", { falsified: true, evidenceStrength: 0.9 });

      const profiles = scheduler.getAllProfiles();
      const profA = profiles.find((p) => p.hypothesisId === "cand-A");
      const profB = profiles.find((p) => p.hypothesisId === "cand-B");

      expect(profA?.status).toBe("FALSIFIED");
      expect(profA?.posteriorConfidence).toBe(0.0);

      // Cand B takes correlated dampening penalty because Cand A at the same level was falsified
      expect(profB?.status).toBe("QUEUED");
      expect(profB?.priorConfidence).toBeLessThan(0.5);
    });

    it("increases posterior confidence upon survival of verification", () => {
      const cand: CandidateHypothesis = {
        id: "cand-survivor",
        level: "L1_function_implementation",
        confidence: 0.5,
        hypothesis: "Surviving candidate",
        experiment: "test",
        worthExperimenting: true,
        evidenceFor: [],
        evidenceAgainst: [],
      };

      const scheduler = new AdaptiveHypothesisScheduler([cand]);
      scheduler.recordExperimentOutcome("cand-survivor", { falsified: false, evidenceStrength: 0.85 });

      const prof = scheduler.getAllProfiles().find((p) => p.hypothesisId === "cand-survivor");
      expect(prof?.status).toBe("SURVIVED");
      expect(prof?.posteriorConfidence).toBeGreaterThan(0.5);
    });
  });

  describe("3. Orchestrator Integration with Resume and Scheduling", () => {
    it("seamlessly resumes an existing run from previous checkpoints using resumeRunId", async () => {
      const journal = new ExecutionJournal(journalDir);
      const memoryManager = new DurableMemoryManager({ repoRoot: tmpDir });
      const runId = "run-orch-resume-test";

      // Mark Inspect and Triage complete in journal
      await journal.recordPhaseStart(runId, "Inspect", 1);
      await journal.recordPhaseComplete(runId, "Inspect", 1);
      await journal.recordPhaseStart(runId, "Triage", 1);
      await journal.recordPhaseComplete(runId, "Triage", 1, {
        decision: { path: "FAST", reason: "Pre-completed fast triage" },
      });

      // Save pre-computed artifacts
      await memoryManager.saveArtifact(runId, "objective.json", { goal: "Resume test goal" });

      const orch = new HarnessOrchestrator({
        goal: "Resume test goal",
        repoRoot: tmpDir,
        resumeRunId: runId,
      });

      expect(orch.context.runId).toBe(runId);
      const finishedCtx = await orch.runUntilFinished();

      expect(finishedCtx.finished).toBe(true);
      expect(finishedCtx.phase).toBe(Phase.Finished);
    });
  });
});
