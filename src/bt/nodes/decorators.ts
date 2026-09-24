import type { BTNode, NodeStatus, NodeExecutionRecord } from "../types.js";

export class RetryNode<TContext> implements BTNode<TContext> {
  constructor(
    public readonly name: string,
    public readonly maxAttempts: number,
    public readonly child: BTNode<TContext>,
    private readonly onRetry?: (attempt: number, context: TContext) => void | Promise<void>
  ) {}

  async tick(context: TContext): Promise<NodeStatus> {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const status = await this.child.tick(context);
      if (status === "SUCCESS") {
        return "SUCCESS";
      }
      if (status === "RUNNING") {
        return "RUNNING";
      }
      if (attempt < this.maxAttempts && this.onRetry) {
        await this.onRetry(attempt, context);
      }
    }
    return "FAILURE";
  }
}

export type GuardPredicate<TContext> = (context: TContext) => Promise<boolean> | boolean;

export class GuardNode<TContext> implements BTNode<TContext> {
  constructor(
    public readonly name: string,
    private readonly predicate: GuardPredicate<TContext>,
    public readonly child: BTNode<TContext>,
    private readonly fallbackStatus: NodeStatus = "FAILURE"
  ) {}

  async tick(context: TContext): Promise<NodeStatus> {
    const allowed = await this.predicate(context);
    if (!allowed) {
      return this.fallbackStatus;
    }
    return this.child.tick(context);
  }
}

export class OptionalNode<TContext> implements BTNode<TContext> {
  constructor(
    public readonly name: string,
    public readonly child: BTNode<TContext>
  ) {}

  async tick(context: TContext): Promise<NodeStatus> {
    const status = await this.child.tick(context);
    if (status === "FAILURE") {
      return "SUCCESS";
    }
    return status;
  }
}

export class InverterNode<TContext> implements BTNode<TContext> {
  constructor(
    public readonly name: string,
    public readonly child: BTNode<TContext>
  ) {}

  async tick(context: TContext): Promise<NodeStatus> {
    const status = await this.child.tick(context);
    if (status === "SUCCESS") return "FAILURE";
    if (status === "FAILURE") return "SUCCESS";
    return status;
  }
}

export interface TraceableContext {
  traceLog?: NodeExecutionRecord[];
}

export class TracerNode<TContext extends TraceableContext> implements BTNode<TContext> {
  constructor(public readonly child: BTNode<TContext>) {}

  get name(): string {
    return this.child.name;
  }

  async tick(context: TContext): Promise<NodeStatus> {
    const startedAt = new Date().toISOString();
    const startTime = performance.now();
    let status: NodeStatus = "FAILURE";
    let errorMsg: string | undefined;

    try {
      status = await this.child.tick(context);
      return status;
    } catch (err: any) {
      errorMsg = err?.message ?? String(err);
      throw err;
    } finally {
      const endTime = performance.now();
      const completedAt = new Date().toISOString();
      const record: NodeExecutionRecord = {
        nodeName: this.name,
        status,
        startedAt,
        completedAt,
        durationMs: Math.round(endTime - startTime),
        error: errorMsg,
      };
      if (context.traceLog) {
        context.traceLog.push(record);
      }
    }
  }
}
