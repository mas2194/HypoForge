import { describe, it, expect, afterEach } from "vitest";
import { BudgetTracker } from "../src/budget/tracker.js";
import { inspectRepository, generateProblemSignature } from "../src/phases/inspect-repo.js";
import { createAndSaveVerifiedMemory } from "../src/memory/verified-memory.js";
import { DurableMemoryManager } from "../src/memory/durable-memory.js";
import { HarnessOrchestrator } from "../src/orchestrator/orchestrator.js";
import { VerificationResultSchema } from "../src/schemas/result.js";
import type { CandidateImplementation } from "../src/schemas/candidate.js";
import fs from "node:fs/promises";
import path from "node:path";

describe("BudgetTracker", () => {
  it("should detect when candidate evaluation budget is exhausted", () => {
    const tracker = new BudgetTracker({ maxCandidates: 3 });
    tracker.recordCandidates(2);
    expect(tracker.checkBudget().exhausted).toBe(false);

    tracker.recordCandidates(2); // total 4 > 3
    const status = tracker.checkBudget();
    expect(status.exhausted).toBe(true);
    expect(status.reason).toContain("Candidate evaluation budget exhausted");
  });

  it("should detect when test run budget is exhausted", () => {
    const tracker = new BudgetTracker({ maxTestRuns: 2 });
    tracker.recordTestRun();
    expect(tracker.checkBudget().exhausted).toBe(false);

    tracker.recordTestRun();
    tracker.recordTestRun(); // total 3 > 2
    const status = tracker.checkBudget();
    expect(status.exhausted).toBe(true);
    expect(status.reason).toContain("Test execution budget exhausted");
  });
});

describe("Repo Inspection & Problem Signature (Anti-Memory Anchoring)", () => {
  it("should inspect repository structure and generate high-signal problem signature", async () => {
    const inspection = await inspectRepository(process.cwd());
    expect(inspection.repoLanguage).toBe("typescript");
    expect(inspection.targetSubsystems).toContain("orchestrator");
    expect(inspection.targetSubsystems).toContain("phases");

    const signature = generateProblemSignature(
      "Optimize query latency in orchestrator context state machine",
      inspection
    );

    expect(signature.domain).toBe("orchestrator");
    expect(signature.relevantModules).toContain("orchestrator");
    expect(signature.searchTerms).toContain("orchestrator");
  });
});

describe("Verified Memory", () => {
  const testDbPath = path.resolve(".agent/test-verified.db");
  const testRunId = `test-run-${Date.now()}`;

  afterEach(async () => {
    await fs.rm(testDbPath, { force: true }).catch(() => {});
    await fs.rm(path.resolve(".agent/runs", testRunId), { recursive: true, force: true }).catch(() => {});
  });

  it("should record empirical facts and verified claims into SQLite FTS5", async () => {
    const memoryManager = new DurableMemoryManager({ dbPath: testDbPath });
    await memoryManager.initRun(testRunId, {
      goal: "Test verified memory recording",
      timestamp: new Date().toISOString(),
      repoRoot: process.cwd(),
    });

    const dummyImpl: CandidateImplementation = {
      candidateId: "cand-verified-1",
      level: "subsystem",
      hypothesis: "Decouple state machine",
      experiment: "Run full suite",
      worktreePath: process.cwd(),
      branchName: "agent/test/verified-branch",
    };

    const dummyVerif = VerificationResultSchema.parse({
      candidateId: "cand-verified-1",
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
        performanceImprovementPercent: 20,
        complexityDelta: 15,
        addedLines: 15,
        deletedLines: 0,
        fileCount: 1,
        architecturalInterventionLevel: 3,
        confidenceScore: 1.0,
      },
      tests: { passed: 5, failed: 0, output: "All tests pass", exitCode: 0 },
      regressions: [],
      score: 140,
    });

    const record = await createAndSaveVerifiedMemory({
      runId: testRunId,
      goal: "Decouple state machine from context",
      repoRoot: process.cwd(),
      implementation: dummyImpl,
      verification: dummyVerif,
      memoryManager,
    });

    expect(record.id).toMatch(/^verified-\d+$/);
    expect(record.evidence.testsPassed).toBe(5);
    expect(record.evidence.exitCode).toBe(0);
    expect(record.confidence).toBe(1.0);

    // Verify FTS5 query recalls the empirically verified claim
    const recalled = memoryManager.searchMemories("Decouple state machine", 5);
    const verifiedItem = recalled.find((r) => r.type === "verified_claim");
    expect(verifiedItem).toBeDefined();
    expect(verifiedItem?.title).toContain("[VERIFIED]");
    expect(verifiedItem?.content).toContain("0 failures");
  });
});
