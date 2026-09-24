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
import type { HarnessEventBus } from "../server/event-bus.js";

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
  maxAutomaticRestarts?: number;
  budgetLimits?: Partial<BudgetLimits>;
  enableTracing?: boolean;
  dbPath?: string;
  resumeRunId?: string;
  eventBus?: HarnessEventBus;
}

export class HarnessOrchestrator {
  public readonly context: HarnessContext;
  public readonly tree: BTNode<HarnessContext>;
  private readonly resumeRunId?: string;
  private readonly maxAutomaticRestarts: number;

  constructor(options: OrchestratorOptions) {
    this.resumeRunId = options.resumeRunId;
    this.maxAutomaticRestarts = Math.max(0, Math.floor(options.maxAutomaticRestarts ?? 1));
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
      recoveryHistory: [],
      compactionRecords: [],
      traceLog: [],
      eventBus: options.eventBus,
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
        this.context.eventBus?.emitFinish({
          runId: this.context.runId,
          phase: Phase.Finished,
          summary: "Run resumed and completed.",
        });
        return this.context;
      }
    }

    let status: NodeStatus = "FAILURE";
    let lastError: string | undefined;
    for (let restart = 0; restart <= this.maxAutomaticRestarts; restart++) {
      this.context.error = undefined;
      try {
        status = await this.tree.tick(this.context);
        lastError = status === "FAILURE"
          ? this.context.error ?? `${this.context.phase} phase returned FAILURE.`
          : undefined;
      } catch (error) {
        status = "FAILURE";
        lastError = error instanceof Error ? error.stack || error.message : String(error);
      }

      if (status !== "FAILURE") break;
      this.context.error = lastError;
      if (restart >= this.maxAutomaticRestarts) break;

      const budget = this.context.budgetTracker.checkBudget();
      if (budget.exhausted) {
        this.context.error = `${lastError}\nAutomatic restart skipped: ${budget.reason}`;
        console.error(`[Orchestrator:Recovery] Cannot restart: ${budget.reason}`);
        break;
      }

      const previousResults = this.captureFailedRun(lastError ?? "Behavior Tree returned FAILURE.");
      (this.context.recoveryHistory ??= []).push(previousResults);
      await this.context.memoryManager.saveArtifact(
        this.context.runId,
        `recovery-attempt-${restart + 1}.json`,
        JSON.parse(previousResults)
      ).catch((error) => {
        console.warn("[Orchestrator:Recovery] Could not persist previous results:", error);
      });

      console.warn(`[Orchestrator:Recovery] Restarting from Inspect (${restart + 1}/${this.maxAutomaticRestarts}) with prior results and error context.`);
      this.context.eventBus?.emitChat({
        id: `recovery-${Date.now()}`,
        role: "system",
        text: `⚠️ Execution failed during ${this.context.phase}. Restarting from Inspect with the error and all results from this attempt included.\n\n\`${lastError ?? "Behavior Tree returned FAILURE."}\``,
      });
      this.context.eventBus?.emitEvent({
        type: "harness:status",
        data: { running: true, activeGoal: this.context.goal, phase: Phase.Inspect },
      });
      await this.resetForAutomaticRestart();
    }

    this.context.finished = true;
    this.context.phase = Phase.Finished;

    if (status === "FAILURE") {
      this.context.error = this.context.error ?? lastError ?? "Execution halted: Behavior Tree returned FAILURE";
    } else {
      this.context.error = undefined;
    }

    const winnerSummary = this.context.winner
      ? `Winner: ${this.context.winner.implementation.candidateId} (${this.context.winner.implementation.level}) with score ${this.context.winner.verification.score.toFixed(2)}`
      : "No winning candidate integrated.";

    this.context.eventBus?.emitFinish({
      runId: this.context.runId,
      phase: Phase.Finished,
      winner: this.context.winner
        ? {
            candidateId: this.context.winner.implementation.candidateId,
            level: this.context.winner.implementation.level,
            score: this.context.winner.verification.score,
          }
        : undefined,
      error: this.context.error,
      unresolved: this.context.unresolved,
      unresolvedReason: this.context.unresolvedReason,
      summary: winnerSummary,
    });

    return this.context;
  }

  private captureFailedRun(error: string): string {
    const context = this.context;
    const recoveryHistory = context.recoveryHistory ?? (context.recoveryHistory = []);
    const results = {
      attempt: recoveryHistory.length + 1,
      failedPhase: context.phase,
      error,
      goal: context.goal,
      repoInspection: context.repoInspection,
      problemSignature: context.problemSignature,
      activeSkills: context.activeSkills,
      triageDecision: context.triageDecision,
      researchRouting: context.researchRouting,
      research: context.research,
      diagnosis: context.diagnosis,
      diversityEvaluation: context.diversityEvaluation,
      falsifiedCandidates: context.falsifiedCandidates,
      falsificationReviews: context.falsificationReviews,
      implementations: context.implementations,
      baselineVerification: context.baselineVerification,
      verifications: context.verifications,
      paretoComparison: context.paretoComparison,
      winner: context.winner,
      review: context.review,
      rejectedCandidates: context.rejectedCandidates,
      rejectionFeedbacks: context.rejectionFeedbacks,
      distilledLessons: context.distilledLessons,
      traceLog: context.traceLog,
      budgetUsage: context.budgetTracker.getUsage(),
      evidence: {
        observations: context.evidenceStore.getAllObservations(),
        assertions: context.evidenceStore.getAllAssertions(),
        inferences: context.evidenceStore.getAllInferences(),
        decisions: context.evidenceStore.getAllDecisions(),
      },
    };
    return JSON.stringify(results, null, 2);
  }

  private async resetForAutomaticRestart(): Promise<void> {
    const context = this.context;
    const recoveryHistory = context.recoveryHistory ?? (context.recoveryHistory = []);
    await context.worktreeManager.cleanAllWorktrees().catch((error) => {
      console.warn("[Orchestrator:Recovery] Worktree cleanup failed before restart:", error);
    });

    context.phase = Phase.Inspect;
    context.finished = false;
    context.error = undefined;
    context.unresolved = undefined;
    context.unresolvedReason = undefined;
    context.repoInspection = undefined;
    context.problemSignature = undefined;
    context.recalledMemories = [];
    context.activeSkills = [];
    context.triageDecision = undefined;
    context.researchRouting = undefined;
    context.research = undefined;
    context.diagnosis = undefined;
    context.diversityEvaluation = undefined;
    context.falsifiedCandidates = undefined;
    context.falsificationReviews = undefined;
    context.implementations = [];
    context.verifications = [];
    context.baselineVerification = undefined;
    context.paretoComparison = undefined;
    context.candidateQueue = [];
    context.rejectedCandidates = [];
    context.hypothesisScheduler = undefined;
    context.winner = undefined;
    context.review = undefined;
    context.verifiedCommitSha = undefined;
    context.commitGraph = undefined;
    context.publishedPrUrl = undefined;
    context.adrFilename = undefined;
    context.verifiedMemory = undefined;
    context.crystallizedSkill = undefined;
    context.exportedTrajectoryPath = undefined;
    context.backtrackDecision = undefined;
    context.rejectionFeedbacks = [];
    context.distilledLessons = [];
    context.iteration = 1;
    context.currentAttempt = {
      id: `attempt-restart-${recoveryHistory.length}-fast`,
      type: "FAST",
      iteration: 1,
      worktreePaths: [],
      implementations: [],
      verifications: [],
      candidateQueue: [],
      rejectedCandidates: [],
      rollbackTransientState: async () => context.worktreeManager.cleanAllWorktrees(),
    };
    context.attempts.push(context.currentAttempt);
    context.traceLog = [];
  }
}
