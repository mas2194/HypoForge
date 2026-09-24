export type NodeStatus = "SUCCESS" | "FAILURE" | "RUNNING";

export interface NodeExecutionRecord {
  nodeName: string;
  status: NodeStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  error?: string;
}

export interface BTNode<TContext> {
  readonly name: string;
  tick(context: TContext): Promise<NodeStatus>;
}
