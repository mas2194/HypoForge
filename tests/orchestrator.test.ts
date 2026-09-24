import { describe, it, expect, afterEach } from "vitest";
import { HarnessStateMachine, Phase } from "../src/orchestrator/state-machine.js";
import { WorktreeManager } from "../src/git/worktree.js";

describe("HarnessStateMachine", () => {
  const manager = new WorktreeManager();

  afterEach(async () => {
    await manager.cleanAllWorktrees();
  });

  it("should execute full loop from Diagnose to Integrate", async () => {
    const sm = new HarnessStateMachine({
      goal: "Optimize query caching module",
      testCommand: "node -e 'process.exit(0)'",
      useCodex: false, // test mode with deterministic fallback
    });

    const finalState = await sm.runUntilFinished();

    expect(finalState.finished).toBe(true);
    expect(finalState.diagnosis).toBeDefined();
    expect(finalState.diagnosis?.candidates.length).toBeGreaterThanOrEqual(2);
    expect(finalState.implementations.length).toBeGreaterThanOrEqual(2);
    expect(finalState.verifications.length).toBeGreaterThanOrEqual(2);
    expect(finalState.winner).toBeDefined();
    // Subsystem/redesign should win due to higher architecture bonus when both pass
    expect(finalState.winner?.implementation.level).toBe("subsystem");
  });
});
