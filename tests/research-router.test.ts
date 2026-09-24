import { describe, it, expect } from "vitest";
import { routeResearch } from "../src/phases/research-router.js";
import { HarnessOrchestrator } from "../src/orchestrator/orchestrator.js";
import { Phase } from "../src/orchestrator/context.js";
import { WorktreeManager } from "../src/git/worktree.js";
import fs from "node:fs/promises";
import path from "node:path";

describe("ResearchRouter", () => {
  it("should trigger research for performance, concurrency, or architectural goals", () => {
    const perfDecision = routeResearch("Optimize indexing layer for sub-millisecond query latency");
    expect(perfDecision.shouldResearch).toBe(true);
    expect(perfDecision.detectedSignals).toContain("Performance / Latency Target");

    const concurrencyDecision = routeResearch("Fix lock contention in lock-free queue");
    expect(concurrencyDecision.shouldResearch).toBe(true);
    expect(concurrencyDecision.detectedSignals).toContain("Concurrency / Execution Model");

    const archDecision = routeResearch("Redesign core data subsystem boundary");
    expect(archDecision.shouldResearch).toBe(true);
    expect(archDecision.detectedSignals).toContain("Architectural Redesign");
  });

  it("should skip research for routine, localized bug fixes or typo corrections", () => {
    const routineDecision = routeResearch("Fix typo in error message string in auth helper");
    expect(routineDecision.shouldResearch).toBe(false);
    expect(routineDecision.detectedSignals.length).toBe(0);
    expect(routineDecision.reason).toContain("Routine or localized task");

    const simpleDecision = routeResearch("Add unit test for math addition utility");
    expect(simpleDecision.shouldResearch).toBe(false);
  });

  it("should integrate with orchestrator and skip research phase for routine goals", async () => {
    const manager = new WorktreeManager();
    let createdRunId: string | null = null;
    let createdAdr: string | null = null;

    try {
      const orchestrator = new HarnessOrchestrator({
        goal: "Fix typo in log message string",
        testCommand: "node -e 'process.exit(0)'",
        useCodex: false,
        publishPr: false,
      });

      const finalState = await orchestrator.runUntilFinished();
      createdRunId = finalState.runId;
      createdAdr = finalState.adrFilename ?? null;

      expect(finalState.finished).toBe(true);
      expect(finalState.phase).toBe(Phase.Finished);
      // Research should be skipped either via fast path triage or research router
      expect(finalState.research).toBeUndefined();
      if (finalState.triageDecision?.path === "FAST") {
        expect(finalState.triageDecision.path).toBe("FAST");
      } else {
        expect(finalState.researchRouting?.shouldResearch).toBe(false);
      }
    } finally {

      await manager.cleanAllWorktrees();
      if (createdRunId) {
        await fs.rm(path.resolve(".agent/runs", createdRunId), { recursive: true, force: true }).catch(() => {});
      }
      if (createdAdr) {
        await fs.rm(path.resolve(".agent/decisions", createdAdr), { force: true }).catch(() => {});
      }
    }
  });
});
