import { WorktreeManager } from "../git/worktree.js";
import { Evaluator } from "../evaluator/runner.js";
import { DurableMemoryManager } from "../memory/durable-memory.js";
import { SkillManager } from "../skills/skill-manager.js";
import { TrajectoryExporter } from "../trajectory/exporter.js";
import { GitHubBroker } from "../github/broker.js";
import { CodexClientManager, type SandboxMode, type ApprovalMode, type ModelReasoningEffort } from "../codex/client.js";
import { ContextCompactor } from "./compactor.js";
import { buildHarnessBehaviorTree } from "./tree.js";
import type { BTNode, NodeStatus } from "../bt/types.js";
import { Phase, type HarnessContext, type AttemptContext } from "./context.js";
import { StructuredEvidenceStore } from "./evidence-store.js";

import { BudgetTracker, type BudgetLimits } from "../budget/tracker.js";

import { ExecutionJournal } from "../journal/execution-journal.js";
import { reconcileRun, applyReconciledStateToContext } from "../journal/reconciliation.js";

export interface OrchestratorOptions {
  goal: string;
  repoRoot?: string;
  testCommand?: string;
  useCodex?: boolean;
  codexSandboxMode?: SandboxMode;
  codexApprovalPolicy?: ApprovalMode;
  codexModel?: string;
  codexModelReasoningEffort?: ModelReasoningEffort;
  publishPr?: boolean;
  maxExplorationAttempts?: number;
  budgetLimits?: Partial<BudgetLimits>;
  enableTracing?: boolean;
  dbPath?: string;
  resumeRunId?: string;
}

export class HarnessOrchestrator {
  public readonly context: HarnessContext;
  public readonly tree: BTNode<HarnessContext>;
  private readonly resumeRunId?: string;

  constructor(options: OrchestratorOptions) {
    this.resumeRunId = options.resumeRunId;
    const runId = options.resumeRunId ?? `run-${Date.now()}`;
    const worktreeManager = new WorktreeManager({ repoRoot: options.repoRoot });
    const evaluator = new Evaluator();
    const memoryManager = new DurableMemoryManager({
      repoRoot: options.repoRoot,
      dbPath: options.dbPath,
    });
    const skillManager = new SkillManager({
      repoRoot: options.repoRoot,
      ftsIndex: memoryManager.ftsIndex,
    });
    const trajectoryExporter = new TrajectoryExporter(worktreeManager.repoRoot);
    const githubBroker = new GitHubBroker();
    let codexManager: CodexClientManager | undefined;

    if (options.useCodex) {
      try {
        codexManager = new CodexClientManager({
          defaultSandboxMode: options.codexSandboxMode,
          defaultApprovalPolicy: options.codexApprovalPolicy,
          defaultModel: options.codexModel,
          defaultModelReasoningEffort: options.codexModelReasoningEffort,
        });
      } catch (err) {
        console.warn("Could not initialize CodexClientManager:", err);
      }
    }

    const budgetTracker = new BudgetTracker(options.budgetLimits);

    const evidenceStore = new StructuredEvidenceStore();
    const initialAttempt: AttemptContext = {
      id: `attempt-1-fast`,
      type: "FAST",
      iteration: 1,
      worktreePaths: [],
      implementations: [],
      verifications: [],
      candidateQueue: [],
      rejectedCandidates: [],
      rollbackTransientState: async () => {
        try {
          await worktreeManager.cleanAllWorktrees();
        } catch (err) {
          console.warn("Warning rolling back worktrees:", err);
        }
      },
    };

    this.context = {
      goal: options.goal,
      runId,
      repoRoot: worktreeManager.repoRoot,
      testCommand: options.testCommand,
      publishPr: options.publishPr ?? false,
      targetMode: options.publishPr ? "PR" : "LOCAL",
      phase: Phase.Inspect,
      finished: false,
      worktreeManager,
      evaluator,
      memoryManager,
      skillManager,
      trajectoryExporter,
      githubBroker,
      codexManager,
      compactor: new ContextCompactor(),
      budgetTracker,
      executionJournal: new ExecutionJournal(options.repoRoot ? `${options.repoRoot}/.agent/journal` : undefined),
      evidenceStore,
      currentAttempt: initialAttempt,
      attempts: [initialAttempt],
      maxIterations: options.maxExplorationAttempts ?? 3,
      recalledMemories: [],

      activeSkills: [],
      implementations: [],
      verifications: [],
      candidateQueue: [],
      rejectedCandidates: [],
      iteration: 1,
      rejectionFeedbacks: [],
      distilledLessons: [],
      compactionRecords: [],
      traceLog: [],
    };

    this.tree = buildHarnessBehaviorTree({
      maxExplorationAttempts: options.maxExplorationAttempts ?? 2,
      enableTracing: options.enableTracing ?? true,
    });
  }

  async runUntilFinished(): Promise<HarnessContext> {
    if (this.resumeRunId) {
      console.log(`[Orchestrator:Reconciliation] Reconciling crashed or paused run '${this.resumeRunId}'...`);
      const reconciled = await reconcileRun({
        runId: this.resumeRunId,
        journal: this.context.executionJournal,
        worktreeManager: this.context.worktreeManager,
        memoryManager: this.context.memoryManager,
      });
      await applyReconciledStateToContext(reconciled, this.context);
      if (reconciled.nextPhase === Phase.Finished) {
        this.context.finished = true;
        this.context.phase = Phase.Finished;
        return this.context;
      }
    }

    const status: NodeStatus = await this.tree.tick(this.context);
    this.context.finished = true;
    this.context.phase = Phase.Finished;

    if (status === "FAILURE") {
      this.context.error = "Execution halted: Behavior Tree returned FAILURE";
    }

    return this.context;
  }
}
