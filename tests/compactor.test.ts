import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { ContextCompactor } from "../src/orchestrator/compactor.js";
import { Phase, type HarnessContext } from "../src/orchestrator/context.js";
import { FtsMemoryIndex } from "../src/memory/fts-index.js";
import { HarnessOrchestrator } from "../src/orchestrator/orchestrator.js";
import * as reviewPhase from "../src/phases/review.js";
import { WorktreeManager } from "../src/git/worktree.js";

describe("ContextCompactor", () => {
  let tmpDir: string;
  let fts: FtsMemoryIndex;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harness-compactor-test-"));
    fts = new FtsMemoryIndex(":memory:");
  });

  afterEach(async () => {
    fts.close();
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it("should purge transient candidate implementations and distill feedback on backtrack", () => {
    const compactor = new ContextCompactor({ maxRetainedFeedbacks: 2 });

    const fakeContext: HarnessContext = {
      goal: "Implement lock-free queue",
      runId: "run-compactor-1",
      repoRoot: tmpDir,
      publishPr: false,
      phase: Phase.Review,
      finished: false,
      iteration: 1,
      worktreeManager: {} as any,
      evaluator: {} as any,
      memoryManager: {
        ftsIndex: fts,
      } as any,
      skillManager: {} as any,
      trajectoryExporter: {} as any,
      githubBroker: {} as any,
      compactor,
      recalledMemories: [],
      activeSkills: [],
      implementations: [
        {
          candidateId: "cand-01",
          level: "local",
          worktreePath: "/tmp/worktree/cand-01",
          branchName: "agent/run-1/cand-01",
          status: "completed",
        },
      ],
      verifications: [
        {
          candidateId: "cand-01",
          tests: { passed: 0, failed: 2, output: "AssertionError: Expected lock-free concurrency" },
          score: 0,
          regressions: [],
        },
      ],
      winner: {
        implementation: {
          candidateId: "cand-01",
          level: "local",
          worktreePath: "/tmp/worktree/cand-01",
          branchName: "agent/run-1/cand-01",
          status: "completed",
        },
        verification: {
          candidateId: "cand-01",
          tests: { passed: 0, failed: 2, output: "AssertionError" },
          score: 0,
          regressions: [],
        },
      },
      rejectionFeedbacks: [
        "Clean-room review rejected candidate: Critical race condition in queue head pointer update",
        "Clean-room review rejected candidate: Buffer allocation causes memory fragmentation under load",
        "No candidate implementation passed the test suite without failures.",
      ],
      distilledLessons: [],
      compactionRecords: [],
      traceLog: new Array(60).fill({ nodeName: "Step", status: "SUCCESS", durationMs: 10 }),
    };

    // Execute backtrack compaction
    const record = compactor.compactForBacktrack(fakeContext);

    // 1. Verify transient worktree and candidate implementations were completely purged
    expect(fakeContext.implementations).toEqual([]);
    expect(fakeContext.verifications).toEqual([]);
    expect(fakeContext.winner).toBeUndefined();

    // 2. Verify distilled lessons were extracted
    expect(fakeContext.distilledLessons.length).toBeGreaterThanOrEqual(2);
    const raceLesson = fakeContext.distilledLessons.find((l) => l.lesson.includes("Critical race condition"));
    expect(raceLesson).toBeDefined();
    expect(raceLesson?.source).toBe("CleanRoomReview");

    // 3. Verify raw feedbacks were condensed
    expect(fakeContext.rejectionFeedbacks.length).toBeLessThanOrEqual(3);
    expect(fakeContext.rejectionFeedbacks[0]).toContain("[Compacted");

    // 4. Verify traceLog was bounded to avoid memory bloating
    expect(fakeContext.traceLog.length).toBeLessThanOrEqual(50);

    // 5. Verify distillation persisted to SQLite FTS5 for cross-run recall
    const ftsResults = fts.search("Critical race condition queue");
    expect(ftsResults.length).toBeGreaterThan(0);
    expect(ftsResults[0].type).toBe("distilled_lesson");

    // 6. Verify compaction record telemetry
    expect(record.reason).toBe("backtrack");
    expect(fakeContext.compactionRecords.length).toBe(1);
  });

  it("should generate high-signal prompt context from distilled lessons and invariants", () => {
    const compactor = new ContextCompactor();

    const fakeContext: HarnessContext = {
      goal: "Refactor database engine",
      runId: "run-compactor-2",
      repoRoot: tmpDir,
      publishPr: false,
      phase: Phase.Diagnose,
      finished: false,
      iteration: 2,
      worktreeManager: {} as any,
      evaluator: {} as any,
      memoryManager: { ftsIndex: fts } as any,
      skillManager: {} as any,
      trajectoryExporter: {} as any,
      githubBroker: {} as any,
      compactor,
      recalledMemories: [
        {
          id: "adr:001",
          type: "adr",
          title: "ADR-001: WAL Mode for SQLite",
          content: "Use write-ahead logging to allow concurrent reads while writing.",
          score: 1.0,
        },
      ],
      activeSkills: [],
      implementations: [],
      verifications: [],
      rejectionFeedbacks: ["Prior failure summary"],
      distilledLessons: [
        {
          iteration: 1,
          source: "CleanRoomReview",
          lesson: "Do not hold global table lock across network I/O boundaries",
          violatedInvariant: "Non-blocking I/O invariant",
        },
      ],
      compactionRecords: [],
      traceLog: [],
    };

    const promptText = compactor.buildDiagnosisPromptContext(fakeContext);
    expect(promptText).toBeDefined();
    expect(promptText).toContain("CRITICAL NEGATIVE CONSTRAINTS");
    expect(promptText).toContain("Do not hold global table lock across network I/O boundaries");
    expect(promptText).toContain("HISTORICAL ARCHITECTURAL DECISIONS & INVARIANTS");
    expect(promptText).toContain("WAL Mode for SQLite");
  });

  it("should integrate with Behavior Tree self-healing loop and compact context across retries", async () => {
    const worktreeManager = new WorktreeManager();
    let attempt = 0;

    const reviewSpy = vi.spyOn(reviewPhase, "runCleanRoomReviewPhase").mockImplementation(async () => {
      attempt++;
      if (attempt <= 2) {
        return {
          approved: false,
          blockingIssues: ["Mutex deadlock hazard in background sync thread"],
          suggestions: ["Use atomic bool flag"],
          feedback: `Rejected attempt ${attempt} due to deadlock risk.`,
        };
      }
      return {
        approved: true,
        blockingIssues: [],
        suggestions: ["Clean design"],
        feedback: "Approved on retry attempt.",
      };
    });

    try {
      const orchestrator = new HarnessOrchestrator({
        goal: "Implement background thread synchronization",
        testCommand: "node -e 'process.exit(0)'",
        useCodex: false,
        publishPr: false,
        maxExplorationAttempts: 2,
      });

      const finalState = await orchestrator.runUntilFinished();

      // Check that retry triggered compaction
      expect(finalState.iteration).toBe(2);
      expect(finalState.compactionRecords.length).toBeGreaterThanOrEqual(1);

      const backtrackRecord = finalState.compactionRecords.find((r) => r.reason === "backtrack");
      expect(backtrackRecord).toBeDefined();
      expect(backtrackRecord?.iteration).toBe(2);

      // Check distilled lessons captured the deadlock hazard
      expect(finalState.distilledLessons.length).toBeGreaterThanOrEqual(1);
      const deadlockLesson = finalState.distilledLessons.find((l) =>
        l.lesson.includes("Mutex deadlock hazard")
      );
      expect(deadlockLesson).toBeDefined();

      // Check phase transition compaction ran before Integrate
      const transitionRecord = finalState.compactionRecords.find((r) => r.reason === "phase_transition");
      expect(transitionRecord).toBeDefined();
    } finally {
      reviewSpy.mockRestore();
      await worktreeManager.cleanAllWorktrees();
    }
  });
});
