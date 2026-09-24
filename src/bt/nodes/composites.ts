import type { BTNode, NodeStatus } from "../types.js";

export class SequenceNode<TContext> implements BTNode<TContext> {
  constructor(
    public readonly name: string,
    public readonly children: BTNode<TContext>[]
  ) {}

  async tick(context: TContext): Promise<NodeStatus> {
    for (const child of this.children) {
      const status = await child.tick(context);
      if (status !== "SUCCESS") {
        return status;
      }
    }
    return "SUCCESS";
  }
}

export class SelectorNode<TContext> implements BTNode<TContext> {
  constructor(
    public readonly name: string,
    public readonly children: BTNode<TContext>[]
  ) {}

  async tick(context: TContext): Promise<NodeStatus> {
    for (const child of this.children) {
      const status = await child.tick(context);
      if (status === "SUCCESS") {
        return "SUCCESS";
      }
      if (status === "RUNNING") {
        return "RUNNING";
      }
    }
    return "FAILURE";
  }
}

export type ParallelPolicy = "requireAll" | "requireOne";

export class ParallelNode<TContext> implements BTNode<TContext> {
  constructor(
    public readonly name: string,
    public readonly children: BTNode<TContext>[],
    public readonly policy: ParallelPolicy = "requireAll"
  ) {}

  async tick(context: TContext): Promise<NodeStatus> {
    const statuses = await Promise.all(this.children.map((child) => child.tick(context)));

    if (this.policy === "requireAll") {
      const allSuccess = statuses.every((s) => s === "SUCCESS");
      return allSuccess ? "SUCCESS" : "FAILURE";
    } else {
      const anySuccess = statuses.some((s) => s === "SUCCESS");
      return anySuccess ? "SUCCESS" : "FAILURE";
    }
  }
}
