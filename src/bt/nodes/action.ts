import type { BTNode, NodeStatus } from "../types.js";

export type ActionHandler<TContext> = (
  context: TContext
) => Promise<NodeStatus | boolean | void> | NodeStatus | boolean | void;

export class ActionNode<TContext> implements BTNode<TContext> {
  constructor(
    public readonly name: string,
    private readonly handler: ActionHandler<TContext>
  ) {}

  async tick(context: TContext): Promise<NodeStatus> {
    try {
      const result = await this.handler(context);
      if (result === "FAILURE" || result === false) {
        return "FAILURE";
      }
      if (result === "RUNNING") {
        return "RUNNING";
      }
      return "SUCCESS";
    } catch (err) {
      console.error(`[BT:Action] Error executing action "${this.name}":`, err);
      throw err;
    }
  }
}
