import { describe, it, expect, vi, afterEach } from "vitest";
import { HarnessOrchestrator } from "../src/orchestrator/orchestrator.js";
import { Phase } from "../src/orchestrator/context.js";
import { WorktreeManager } from "../src/git/worktree.js";
import * as reviewPhase from "../src/phases/review.js";
import fs from "node:fs/promises";
import path from "node:path";

describe("HarnessOrchestrator (Behavior Tree)", () => {
  const manager = new WorktreeManager();
  let createdRunId: string | null = null;
  let createdAdr: string | null = null;

  afterEach(async () => {
    await manager.cleanAllWorktrees();
    if (createdRunId) {
      await fs.rm(path.resolve(".agent/runs", createdRunId), { recursive: true, force: true }).catch(() => {});
      createdRunId = null;
    }
    if (createdAdr) {
      await fs.rm(path.resolve(".agent/decisions", createdAdr), { force: true }).catch(() => {});
      createdAdr = null;
    }
  });

  it("should run full pipeline and record node execution traces", async () => {
    const orchestrator = new HarnessOrchestrator({
      goal: "Implement lock-free cache with zero-copy buffer eviction",
      testCommand: "node -e 'process.exit(0)'",
      useCodex: false,
      publishPr: true,
      enableTracing: true,
    });

    const finalState = await orchestrator.runUntilFinished();
    createdRunId = finalState.runId;
    createdAdr = finalState.adrFilename ?? null;

    expect(finalState.finished).toBe(true);
    expect(finalState.phase).toBe(Phase.Finished);
    expect(finalState.winner).toBeDefined();
    expect(finalState.publishedPrUrl).toBeDefined();
    expect(finalState.adrFilename).toMatch(/^ADR-\d{4}\.md$/);

    // Verify trace logs captured every executed BT node
    expect(finalState.traceLog.length).toBeGreaterThan(0);
    const executedNodeNames = finalState.traceLog.map((t) => t.nodeName);

    expect(executedNodeNames).toContain("Inspect");
    expect(executedNodeNames).toContain("Research");
    expect(executedNodeNames).toContain("Diagnose");
    expect(executedNodeNames).toContain("Falsify");
    expect(executedNodeNames).toContain("DiversityGate");
    expect(executedNodeNames).toContain("Implement");
    expect(executedNodeNames).toContain("Verify");
    expect(executedNodeNames).toContain("Compare");
    expect(executedNodeNames).toContain("CleanRoomReview");
    expect(executedNodeNames).toContain("Integrate");
    expect(executedNodeNames).toContain("Publish");
    expect(executedNodeNames).toContain("Learn");

    for (const record of finalState.traceLog) {
      expect(record.durationMs).toBeGreaterThanOrEqual(0);
      expect(record.status).toBe("SUCCESS");
    }
  });

  it("should approve next candidate in candidate queue without backtracking when first candidate is rejected", async () => {
    let reviewCallCount = 0;
    const reviewSpy = vi.spyOn(reviewPhase, "runCleanRoomReviewPhase").mockImplementation(async () => {
      reviewCallCount++;
      if (reviewCallCount === 1) {
        // First candidate in queue: reject
        return {
          approved: false,
          blockingIssues: ["Critical lock contention hazard detected in lock-free eviction queue"],
          suggestions: ["Replace spinlock with atomic CAS exchange"],
          feedback: "Rejected first candidate due to concurrency hazard.",
        };
      }
      // Second candidate in queue: approve
      return {
        approved: true,
        blockingIssues: [],
        suggestions: ["Good atomic safety"],
        feedback: "Clean-room review passed for second candidate.",
      };
    });

    try {
      const orchestrator = new HarnessOrchestrator({
        goal: "Refactor cache eviction queue for concurrent multi-thread access",
        testCommand: "node -e 'process.exit(0)'",
        useCodex: false,
        publishPr: false,
        maxExplorationAttempts: 2,
      });

      const finalState = await orchestrator.runUntilFinished();
      createdRunId = finalState.runId;
      createdAdr = finalState.adrFilename ?? null;

      expect(finalState.finished).toBe(true);
      // Both candidates were reviewed in the same iteration without backtracking
      expect(reviewCallCount).toBe(2);
      expect(finalState.iteration).toBe(1);
      expect(finalState.rejectedCandidates.length).toBe(1);
      expect(finalState.rejectionFeedbacks.length).toBeGreaterThanOrEqual(1);
      expect(finalState.rejectionFeedbacks[0]).toContain("Critical lock contention hazard detected");
      expect(finalState.winner).toBeDefined();
      expect(finalState.adrFilename).toBeDefined();
    } finally {
      reviewSpy.mockRestore();
    }
  });

  it("should backtrack to Diagnose when all candidates in candidate queue are rejected", async () => {
    let reviewCallCount = 0;
    const reviewSpy = vi.spyOn(reviewPhase, "runCleanRoomReviewPhase").mockImplementation(async () => {
      reviewCallCount++;
      if (reviewCallCount <= 2) {
        // Iteration 1: reject both candidate 1 and candidate 2
        return {
          approved: false,
          blockingIssues: [`Rejection issue #${reviewCallCount}`],
          suggestions: ["Revise architecture"],
          feedback: "Rejected.",
        };
      }
      // Iteration 2: approve
      return {
        approved: true,
        blockingIssues: [],
        suggestions: ["Clean design"],
        feedback: "Approved on iteration 2.",
      };
    });

    try {
      const orchestrator = new HarnessOrchestrator({
        goal: "Refactor cache eviction queue for concurrent multi-thread access",
        testCommand: "node -e 'process.exit(0)'",
        useCodex: false,
        publishPr: false,
        maxExplorationAttempts: 2,
      });

      const finalState = await orchestrator.runUntilFinished();
      createdRunId = finalState.runId;
      createdAdr = finalState.adrFilename ?? null;

      expect(finalState.finished).toBe(true);
      expect(reviewCallCount).toBe(3);
      expect(finalState.iteration).toBe(2);
      expect(finalState.backtrackDecision).toBeDefined();
      expect(finalState.rejectionFeedbacks.length).toBeGreaterThanOrEqual(2);
      expect(finalState.winner).toBeDefined();
      expect(finalState.adrFilename).toBeDefined();
    } finally {
      reviewSpy.mockRestore();
    }
  });
});
