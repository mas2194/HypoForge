import { WorktreeManager } from "../git/worktree.js";
import { Evaluator } from "../evaluator/runner.js";
import { DurableMemoryManager } from "../memory/durable-memory.js";
import { GitHubBroker } from "../github/broker.js";
import { CodexClientManager } from "../codex/client.js";
import { buildHarnessBehaviorTree } from "./tree.js";
import type { BTNode, NodeStatus } from "../bt/types.js";
import { Phase, type HarnessContext } from "./context.js";

export interface OrchestratorOptions {
  goal: string;
  repoRoot?: string;
  testCommand?: string;
  useCodex?: boolean;
  publishPr?: boolean;
  maxExplorationAttempts?: number;
  enableTracing?: boolean;
}

export class HarnessOrchestrator {
  public readonly context: HarnessContext;
  public readonly tree: BTNode<HarnessContext>;

  constructor(options: OrchestratorOptions) {
    const runId = `run-${Date.now()}`;
    const worktreeManager = new WorktreeManager({ repoRoot: options.repoRoot });
    const evaluator = new Evaluator();
    const memoryManager = new DurableMemoryManager({ repoRoot: options.repoRoot });
    const githubBroker = new GitHubBroker();
    let codexManager: CodexClientManager | undefined;

    if (options.useCodex) {
      try {
        codexManager = new CodexClientManager();
      } catch (err) {
        console.warn("Could not initialize CodexClientManager:", err);
      }
    }

    this.context = {
      goal: options.goal,
      runId,
      repoRoot: worktreeManager.repoRoot,
      testCommand: options.testCommand,
      publishPr: options.publishPr ?? false,
      phase: Phase.Inspect,
      finished: false,
      worktreeManager,
      evaluator,
      memoryManager,
      githubBroker,
      codexManager,
      implementations: [],
      verifications: [],
      iteration: 1,
      rejectionFeedbacks: [],
      traceLog: [],
    };

    this.tree = buildHarnessBehaviorTree({
      maxExplorationAttempts: options.maxExplorationAttempts ?? 2,
      enableTracing: options.enableTracing ?? true,
    });
  }

  async runUntilFinished(): Promise<HarnessContext> {
    const status: NodeStatus = await this.tree.tick(this.context);
    this.context.finished = true;
    this.context.phase = Phase.Finished;

    if (status === "FAILURE") {
      this.context.error = "Execution halted: Behavior Tree returned FAILURE";
    }

    return this.context;
  }
}
