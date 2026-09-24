import { describe, it, expect } from "vitest";
import {
  action,
  sequence,
  selector,
  parallel,
  retry,
  guard,
  optional,
  inverter,
  trace,
  type TraceableContext,
} from "../src/bt/index.js";

interface TestContext extends TraceableContext {
  count: number;
  logs: string[];
}

describe("Behavior Tree Engine", () => {
  it("should execute SequenceNode until failure or success", async () => {
    const ctx: TestContext = { count: 0, logs: [] };

    const seq = sequence("TestSeq", [
      action("step1", (c: TestContext) => {
        c.count += 1;
        c.logs.push("step1");
      }),
      action("step2", (c: TestContext) => {
        c.count += 10;
        c.logs.push("step2");
        return "FAILURE";
      }),
      action("step3", (c: TestContext) => {
        c.count += 100;
        c.logs.push("step3");
      }),
    ]);

    const status = await seq.tick(ctx);
    expect(status).toBe("FAILURE");
    expect(ctx.count).toBe(11);
    expect(ctx.logs).toEqual(["step1", "step2"]);
  });

  it("should execute SelectorNode for fallbacks", async () => {
    const ctx: TestContext = { count: 0, logs: [] };

    const sel = selector("TestSelector", [
      action("primary", () => "FAILURE"),
      action("fallback", (c: TestContext) => {
        c.logs.push("fallback-ran");
        return "SUCCESS";
      }),
      action("unreachable", (c: TestContext) => {
        c.logs.push("unreachable");
      }),
    ]);

    const status = await sel.tick(ctx);
    expect(status).toBe("SUCCESS");
    expect(ctx.logs).toEqual(["fallback-ran"]);
  });

  it("should retry failures up to maxAttempts", async () => {
    const ctx: TestContext = { count: 0, logs: [] };

    const retryNode = retry(
      3,
      "RetryStep",
      action("flaky", (c: TestContext) => {
        c.count += 1;
        if (c.count < 3) return "FAILURE";
        return "SUCCESS";
      }),
      (attempt, c) => {
        c.logs.push(`retry-${attempt}`);
      }
    );

    const status = await retryNode.tick(ctx);
    expect(status).toBe("SUCCESS");
    expect(ctx.count).toBe(3);
    expect(ctx.logs).toEqual(["retry-1", "retry-2"]);
  });

  it("should support Guard, Optional, and Inverter decorators", async () => {
    const ctx: TestContext = { count: 0, logs: [] };

    const guardedNode = guard(
      (c: TestContext) => c.count > 10,
      action("shouldNotRun", (c: TestContext) => {
        c.count = 999;
      })
    );
    expect(await guardedNode.tick(ctx)).toBe("FAILURE");
    expect(ctx.count).toBe(0);

    const optNode = optional("OptFail", action("fail", () => "FAILURE"));
    expect(await optNode.tick(ctx)).toBe("SUCCESS");

    const inv = inverter("Invert", action("ok", () => "SUCCESS"));
    expect(await inv.tick(ctx)).toBe("FAILURE");
  });

  it("should trace node executions with duration and status", async () => {
    const ctx: TestContext = { count: 0, logs: [], traceLog: [] };

    const tracedSeq = trace(
      sequence("TracedSeq", [
        trace(action("A", () => "SUCCESS")),
        trace(action("B", () => "SUCCESS")),
      ])
    );

    const status = await tracedSeq.tick(ctx);
    expect(status).toBe("SUCCESS");
    expect(ctx.traceLog?.length).toBe(3); // A, B, and parent TracedSeq
    expect(ctx.traceLog?.map((t) => t.nodeName)).toContain("A");
    expect(ctx.traceLog?.map((t) => t.nodeName)).toContain("B");
    expect(ctx.traceLog?.map((t) => t.nodeName)).toContain("TracedSeq");
  });
});
