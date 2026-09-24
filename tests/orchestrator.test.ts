import { describe, it, expect, afterEach } from "vitest";
import { HarnessStateMachine, Phase } from "../src/orchestrator/state-machine.js";
import { WorktreeManager } from "../src/git/worktree.js";
import fs from "node:fs/promises";
import path from "node:path";

describe("HarnessStateMachine Full Loop", () => {
  const manager = new WorktreeManager();
  let createdRunId: string | null = null;
  let createdAdr: string | null = null;

  afterEach(async () => {
    await manager.cleanAllWorktrees();
    if (createdRunId) {
      await fs.rm(path.resolve(".agent/runs", createdRunId), { recursive: true, force: true }).catch(() => {});
    }
    if (createdAdr) {
      await fs.rm(path.resolve(".agent/decisions", createdAdr), { force: true }).catch(() => {});
    }
  });

  it("should execute full autonomous lifecycle through all 12 phases including research", async () => {
    const sm = new HarnessStateMachine({
      goal: "Redesign data indexing layer for sub-millisecond query latency",
      testCommand: "node -e 'process.exit(0)'",
      useCodex: false, // deterministic test mode
      publishPr: true,
    });

    const finalState = await sm.runUntilFinished();
    createdRunId = finalState.runId;
    createdAdr = finalState.adrFilename ?? null;

    // 1. Verification of lifecycle completion
    expect(finalState.finished).toBe(true);
    expect(finalState.phase).toBe(Phase.Finished);

    // 2. Verification of Research Phase
    expect(finalState.research).toBeDefined();
    expect(finalState.research?.priorArt.length).toBeGreaterThanOrEqual(1);
    expect(finalState.research?.sotaApproaches.length).toBeGreaterThanOrEqual(1);
    expect(finalState.research?.suggestedArchitecturalPatterns.length).toBeGreaterThanOrEqual(1);
    expect(finalState.research?.pitfallsToAvoid.length).toBeGreaterThanOrEqual(1);

    // 3. Verification of Diagnose & Falsify (influenced by research)
    expect(finalState.diagnosis).toBeDefined();
    expect(finalState.falsifiedCandidates?.length).toBeGreaterThanOrEqual(1);
    expect(finalState.falsificationReviews?.length).toBeGreaterThanOrEqual(2);

    // 4. Verification of Implement & Verify
    expect(finalState.implementations.length).toBeGreaterThanOrEqual(1);
    expect(finalState.verifications.length).toBeGreaterThanOrEqual(1);

    // 5. Verification of Compare & Review
    expect(finalState.winner).toBeDefined();
    expect(finalState.review).toBeDefined();
    expect(finalState.review?.approved).toBe(true);

    // 6. Verification of Publish & Learn (ADR + Artifacts)
    expect(finalState.publishedPrUrl).toBeDefined();
    expect(finalState.adrFilename).toMatch(/^ADR-\d{4}\.md$/);

    // Check durable memory files on disk
    const runDir = path.resolve(".agent/runs", finalState.runId);
    const objectiveExists = await fs.access(path.resolve(runDir, "objective.json")).then(() => true).catch(() => false);
    const researchExists = await fs.access(path.resolve(runDir, "research.json")).then(() => true).catch(() => false);
    const diagnosisExists = await fs.access(path.resolve(runDir, "diagnosis.json")).then(() => true).catch(() => false);
    const falsificationExists = await fs.access(path.resolve(runDir, "falsification.json")).then(() => true).catch(() => false);
    const reviewExists = await fs.access(path.resolve(runDir, "review.json")).then(() => true).catch(() => false);
    const finalExists = await fs.access(path.resolve(runDir, "final.json")).then(() => true).catch(() => false);

    expect(objectiveExists).toBe(true);
    expect(researchExists).toBe(true);
    expect(diagnosisExists).toBe(true);
    expect(falsificationExists).toBe(true);
    expect(reviewExists).toBe(true);
    expect(finalExists).toBe(true);

    // Check ADR file
    if (finalState.adrFilename) {
      const adrPath = path.resolve(".agent/decisions", finalState.adrFilename);
      const adrContent = await fs.readFile(adrPath, "utf-8");
      expect(adrContent).toContain("Selected candidate");
    }
  });
});
