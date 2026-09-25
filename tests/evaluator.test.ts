import { describe, it, expect } from "vitest";
import { Evaluator } from "../src/evaluator/runner.js";

describe("Evaluator", () => {
  const evaluator = new Evaluator();

  it("should evaluate a successful command", async () => {
    const res = await evaluator.runVerification({
      candidateId: "cand-1",
      worktreePath: process.cwd(),
      testCommand: "node -e 'process.exit(0)'",
      interventionLevel: 2,
    });

    expect(res.candidateId).toBe("cand-1");
    expect(res.tests.passed).toBe(1);
    expect(res.tests.failed).toBe(0);
    expect(res.score).toBeGreaterThan(90);
    expect(res.regressions).toHaveLength(0);
  });

  it("should evaluate a failing command", async () => {
    const res = await evaluator.runVerification({
      candidateId: "cand-2",
      worktreePath: process.cwd(),
      testCommand: "node -e 'process.exit(1)'",
      interventionLevel: 1,
    });

    expect(res.candidateId).toBe("cand-2");
    expect(res.tests.passed).toBe(0);
    expect(res.tests.failed).toBe(1);
    expect(res.score).toBeLessThan(0);
    expect(res.regressions).toHaveLength(1);
  });
});
