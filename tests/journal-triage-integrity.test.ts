import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { verifyTestIntegrity } from "../src/evaluator/integrity.js";
import { triageExecutionPath } from "../src/phases/triage.js";
import { ExecutionJournal } from "../src/journal/execution-journal.js";
import { routeBacktrack, BacktrackTarget } from "../src/orchestrator/backtrack-router.js";
import { isMemoryStale, type VerifiedMemoryRecord } from "../src/memory/verified-memory.js";

describe("Production Extensions: Integrity, Triage, Journal & Invalidation", () => {
  const testDir = path.resolve(".agent/test-scratch", `test-${Date.now()}`);

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("Test & Oracle Integrity Gate", () => {
    it("should pass integrity check for untouched worktrees", async () => {
      const result = await verifyTestIntegrity({
        worktreePath: process.cwd(),
        repoRoot: process.cwd(),
        baseBranch: "main",
      });
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe("Fast / Deep Path Triage", () => {
    const dummyInspection = {
      recentGitHistory: ["feat: initial commit"],
      changedFiles: [],
      keyDependencies: ["typescript", "vitest"],
      targetSubsystems: ["core", "utils"],
      repoLanguage: "typescript",
    };

    it("should triage routine localized typo fixes to FAST path", () => {
      const signature = {
        signatureId: "sig-1",
        domain: "utils",
        relevantModules: ["utils"],
        searchTerms: "typo",
      };
      const decision = triageExecutionPath("Fix typo in error logging message", dummyInspection, signature);
      expect(decision.path).toBe("FAST");
      expect(decision.confidence).toBeGreaterThan(0.9);
    });

    it("should triage architectural, concurrency, or performance goals to DEEP path", () => {
      const signature = {
        signatureId: "sig-2",
        domain: "core",
        relevantModules: ["core", "utils"],
        searchTerms: "concurrency lock-free",
      };
      const decision = triageExecutionPath(
        "Redesign data store concurrency model with lock-free queues",
        dummyInspection,
        signature
      );
      expect(decision.path).toBe("DEEP");
      expect(decision.signals.length).toBeGreaterThan(0);
    });
  });

  describe("Execution Journal & Crash Recovery", () => {
    it("should record phase transitions and retrieve the last committed phase", async () => {
      const journalDir = path.resolve(testDir, "journal");
      const journal = new ExecutionJournal(journalDir);
      const runId = "test-run-101";

      await journal.recordPhaseStart(runId, "Inspect", 1);
      await journal.recordPhaseComplete(runId, "Inspect", 1, { filesInspected: 12 });

      await journal.recordPhaseStart(runId, "Diagnose", 1);
      await journal.recordPhaseComplete(runId, "Diagnose", 1, { candidateCount: 3 });

      await journal.recordPhaseStart(runId, "Implement", 1);
      await journal.recordPhaseFailure(runId, "Implement", 1, "Worktree checkout conflict");

      const entries = await journal.getEntries(runId);
      expect(entries).toHaveLength(6);

      const lastCommitted = await journal.getLastCommittedPhase(runId);

      expect(lastCommitted).toBeDefined();
      expect(lastCommitted?.phaseId).toBe("Diagnose");
      expect(lastCommitted?.status).toBe("COMPLETED");

      const isDiagnoseDone = await journal.isPhaseCompleted(runId, "Diagnose", 1);
      expect(isDiagnoseDone).toBe(true);

      const isImplementDone = await journal.isPhaseCompleted(runId, "Implement", 1);
      expect(isImplementDone).toBe(false);
    });
  });

  describe("Structured FailureClass Backtrack Routing", () => {
    it("should route deterministically using failureClass without relying on regex", () => {
      const res1 = routeBacktrack(["Random text with no keywords"], "IMPLEMENTATION_ERROR");
      expect(res1.target).toBe(BacktrackTarget.Implement);

      const res2 = routeBacktrack(["Random text"], "FALSIFICATION_GAP");
      expect(res2.target).toBe(BacktrackTarget.Falsify);

      const res3 = routeBacktrack(["Random text"], "ROOT_CAUSE_ERROR");
      expect(res3.target).toBe(BacktrackTarget.Diagnose);

      const res4 = routeBacktrack(["Random text"], "EXTERNAL_SPEC");
      expect(res4.target).toBe(BacktrackTarget.Research);

      const res5 = routeBacktrack(["Random text"], "REPO_MODEL_ERROR");
      expect(res5.target).toBe(BacktrackTarget.Inspect);
    });

    it("should fall back gracefully to regex pattern matching when failureClass is omitted", () => {
      const res = routeBacktrack(["Compilation error and syntax error in file"]);
      expect(res.target).toBe(BacktrackTarget.Implement);
    });
  });

  describe("Memory Staleness & Provenance Invalidation", () => {
    it("should detect when memory is superseded, expired, or version-mismatched", () => {
      const baseRecord: VerifiedMemoryRecord = {
        id: "mem-1",
        runId: "run-1",
        claim: "Use repository pattern",
        provenance: "REVIEW_VERIFIED",
        evidence: {
          testsPassed: 10,
          testsFailed: 0,
          exitCode: 0,
          regressionsDetected: 0,
          addedLines: 20,
          deletedLines: 5,
        },
        repo: "my_harness",
        commitHash: "abc1234",
        candidateId: "cand-1",
        interventionLevel: "L6_architecture",
        confidence: 0.95,
        validityScope: "Repository",
        validForDependencyVersion: "1.0.0",
        expiresAt: new Date(Date.now() + 100000).toISOString(),
        verifiedAt: new Date().toISOString(),
      };

      // Valid
      expect(isMemoryStale(baseRecord, { currentDependencyVersion: "1.0.0" })).toBe(false);

      // Dependency upgrade mismatch -> stale
      expect(isMemoryStale(baseRecord, { currentDependencyVersion: "2.0.0" })).toBe(true);

      // Superseded -> stale
      expect(isMemoryStale({ ...baseRecord, supersededBy: "mem-2" })).toBe(true);

      // Expired -> stale
      const expiredRecord = {
        ...baseRecord,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      };
      expect(isMemoryStale(expiredRecord)).toBe(true);
    });
  });
});
