import type { NodeStatus } from "../bt/types.js";
import { Phase, type HarnessContext } from "./context.js";
import {
  researchAction,
  diagnoseAction,
  diversityGateAction,
  falsifyAction,
  implementAction,
  verifyAction,
  compareAction,
  cleanRoomReviewAction,
} from "./actions.js";
import { BacktrackTarget } from "./backtrack-router.js";

export type DeepPhase =
  | "RESEARCH"
  | "DIAGNOSE"
  | "DIVERSITY_GATE"
  | "FALSIFY"
  | "IMPLEMENT"
  | "VERIFY"
  | "COMPARE"
  | "REVIEW";

export function mapTargetToDeepPhase(target: BacktrackTarget): DeepPhase {
  switch (target) {
    case BacktrackTarget.Implement:
      return "IMPLEMENT";
    case BacktrackTarget.Falsify:
      return "FALSIFY";
    case BacktrackTarget.Research:
      return "RESEARCH";
    case BacktrackTarget.Inspect:
    case BacktrackTarget.Diagnose:
    default:
      return "DIAGNOSE";
  }
}

/**
 * DeepController (Hierarchical FSM Exploration Engine):
 * Executes inner state machine with exact phase transitions and direct backtracking jumps.
 * Replaces linear BT retry sequences with deterministic, goal-driven state transitions.
 */
export async function deepControllerAction(ctx: HarnessContext): Promise<NodeStatus> {
  const maxIterations = ctx.maxIterations ?? 3;
  ctx.iteration = ctx.iteration || 1;

  // Initialize DEEP AttemptContext if current is FAST or uninitialized
  if (!ctx.currentAttempt || ctx.currentAttempt.type !== "DEEP") {
    if (ctx.currentAttempt && ctx.currentAttempt.type === "FAST") {
      console.log(
        `[DeepController:Isolation] Escalating from failed FastTrack attempt (${ctx.currentAttempt.id}). Preserving evidence and rolling back transient state.`
      );
      // 1. Rollback all transient worktrees from FastTrack
      await ctx.currentAttempt.rollbackTransientState();

      // 2. Transfer Fast failure evidence to StructuredEvidenceStore
      if (ctx.verifications && ctx.verifications.length > 0) {
        for (const ver of ctx.verifications) {
          ctx.evidenceStore?.addObservation({
            source: `fast_track:${ver.candidateId}`,
            content: `FastTrack verification rejected: exitCode=${ver.tests.exitCode}, passed=${ver.tests.passed}, failed=${ver.tests.failed}`,
            iteration: ctx.iteration,
            data: { candidateId: ver.candidateId, tests: ver.tests, hardGates: ver.hardGates },
          });
        }
      }
      if (ctx.review && !ctx.review.approved) {
        ctx.evidenceStore?.addObservation({
          source: `fast_track:review`,
          content: `FastTrack clean-room audit rejected: ${ctx.review.blockingIssues.join("; ")}`,
          iteration: ctx.iteration,
          data: { review: ctx.review },
        });
      }

      // 3. Clear transient state on blackboard to guarantee strict isolation
      ctx.implementations = [];
      ctx.verifications = [];
      ctx.candidateQueue = [];
      ctx.winner = undefined;
      ctx.review = undefined;
    }

    const deepAttempt = {
      id: `attempt-${Date.now()}-deep`,
      type: "DEEP" as const,
      iteration: ctx.iteration,
      worktreePaths: [],
      implementations: [],
      verifications: [],
      candidateQueue: [],
      rejectedCandidates: [],
      rollbackTransientState: async () => {
        try {
          await ctx.worktreeManager.cleanAllWorktrees();
        } catch (err) {
          console.warn("[DeepController] Warning cleaning worktrees during rollback:", err);
        }
      },
    };
    ctx.currentAttempt = deepAttempt;
    ctx.attempts.push(deepAttempt);
  }

  // 1. Dynamic Entry: Check if resuming from reconciled phase or route to RESEARCH / DIAGNOSE
  const requiresResearch = ctx.triageDecision?.requiresResearch ?? false;
  let nextPhase: DeepPhase;
  if (ctx.phase === Phase.Implement) {
    nextPhase = "IMPLEMENT";
  } else if (ctx.phase === Phase.Verify) {
    nextPhase = "VERIFY";
  } else if (ctx.phase === Phase.Compare) {
    nextPhase = "COMPARE";
  } else if (ctx.phase === Phase.Review) {
    nextPhase = "REVIEW";
  } else if (ctx.phase === Phase.Falsify) {
    nextPhase = "FALSIFY";
  } else if (ctx.phase === Phase.DiversityGate) {
    nextPhase = "DIVERSITY_GATE";
  } else if (ctx.phase === Phase.Diagnose) {
    nextPhase = "DIAGNOSE";
  } else if (ctx.phase === Phase.Research || requiresResearch) {
    nextPhase = "RESEARCH";
  } else {
    nextPhase = "DIAGNOSE";
  }

  console.log(`[DeepController:FSM] Initializing Deep Exploration Loop (Entry Phase: ${nextPhase}, Max Iterations: ${maxIterations})`);

  while (!ctx.budgetTracker.isExhausted() && ctx.iteration <= maxIterations) {
    console.log(`\n[DeepController:FSM] === Iteration ${ctx.iteration}/${maxIterations} -> Phase: [${nextPhase}] ===`);
    await ctx.executionJournal.recordPhaseStart(ctx.runId, nextPhase, ctx.iteration);

    const phaseStartTime = Date.now();
    const recordTrace = (nodeName: string, status: NodeStatus) => {
      const now = new Date().toISOString();
      ctx.traceLog.push({
        nodeName,
        status,
        startedAt: new Date(phaseStartTime).toISOString(),
        completedAt: now,
        durationMs: Date.now() - phaseStartTime,
      });
    };

    switch (nextPhase) {
      case "RESEARCH": {
        ctx.phase = Phase.Research;
        const status = await researchAction(ctx);
        recordTrace("Research", status);
        if (status === "FAILURE") {
          console.error("[DeepController:FSM] Research failed. Returning to the orchestrator for a full restart with prior results.");
          return "FAILURE";
        }
        await ctx.executionJournal.recordPhaseComplete(ctx.runId, nextPhase, ctx.iteration);
        nextPhase = "DIAGNOSE";
        break;
      }

      case "DIAGNOSE": {
        ctx.phase = Phase.Diagnose;
        const status = await diagnoseAction(ctx);
        recordTrace("Diagnose", status);
        if (status === "FAILURE") {
          console.error("[DeepController:FSM] Diagnosis failed to formulate hypotheses.");
          return "FAILURE";
        }
        await ctx.executionJournal.recordPhaseComplete(ctx.runId, nextPhase, ctx.iteration);
        nextPhase = "DIVERSITY_GATE";
        break;
      }

      case "DIVERSITY_GATE": {
        ctx.phase = Phase.DiversityGate;
        const status = await diversityGateAction(ctx);
        recordTrace("DiversityGate", status);
        if (status === "FAILURE") {
          console.error("[DeepController:FSM] Diversity Gate failed. Returning to the orchestrator for a full restart with prior results.");
          return "FAILURE";
        }
        await ctx.executionJournal.recordPhaseComplete(ctx.runId, nextPhase, ctx.iteration);
        nextPhase = "FALSIFY";
        break;
      }

      case "FALSIFY": {
        ctx.phase = Phase.Falsify;
        const status = await falsifyAction(ctx);
        recordTrace("Falsify", status);
        if (status === "FAILURE") {
          console.error("[DeepController:FSM] Falsification failed. Returning to the orchestrator for a full restart with prior results.");
          return "FAILURE";
        }
        await ctx.executionJournal.recordPhaseComplete(ctx.runId, nextPhase, ctx.iteration);
        nextPhase = "IMPLEMENT";
        break;
      }

      case "IMPLEMENT": {
        ctx.phase = Phase.Implement;
        const status = await implementAction(ctx);
        recordTrace("Implement", status);
        if (status === "FAILURE") {
          console.error("[DeepController:FSM] Implementation failed to produce any worktree candidate.");
          return "FAILURE";
        }
        await ctx.executionJournal.recordPhaseComplete(ctx.runId, nextPhase, ctx.iteration);
        nextPhase = "VERIFY";
        break;
      }

      case "VERIFY": {
        ctx.phase = Phase.Verify;
        const status = await verifyAction(ctx);
        recordTrace("Verify", status);
        if (status === "FAILURE") {
          console.error("[DeepController:FSM] Verification failed. Returning to the orchestrator for a full restart with prior results.");
          return "FAILURE";
        }
        await ctx.executionJournal.recordPhaseComplete(ctx.runId, nextPhase, ctx.iteration);
        nextPhase = "COMPARE";
        break;
      }

      case "COMPARE": {
        ctx.phase = Phase.Compare;
        const status = await compareAction(ctx);
        recordTrace("Compare", status);
        if (status === "FAILURE") {
          console.error("[DeepController:FSM] Candidate comparison failed. Returning all verification results to the orchestrator for a full restart.");
          return "FAILURE";
        }
        await ctx.executionJournal.recordPhaseComplete(ctx.runId, nextPhase, ctx.iteration);
        nextPhase = "REVIEW";
        break;
      }

      case "REVIEW": {
        ctx.phase = Phase.Review;
        const status = await cleanRoomReviewAction(ctx);
        recordTrace("CleanRoomReview", status);
        if (status === "SUCCESS") {
          console.log(`[DeepController:FSM] Candidate '${ctx.winner?.implementation.candidateId}' APPROVED by clean-room audit!`);
          await ctx.executionJournal.recordPhaseComplete(ctx.runId, nextPhase, ctx.iteration);
          return "SUCCESS";
        }

        // All candidates rejected by Clean-Room Review
        console.warn("[DeepController:FSM] Clean-room review rejected all queued candidates.");
        console.error("[DeepController:FSM] Clean-room review failed. Returning prior review results to the orchestrator for a full restart.");
        return "FAILURE";
      }
    }
  }

  const budgetStatus = ctx.budgetTracker.checkBudget();
  if (budgetStatus.exhausted) {
    const usage = budgetStatus.usage;
    const limits = budgetStatus.limits;
    ctx.error = `Exploration budget exhausted: ${budgetStatus.reason}. ` +
      `Usage: elapsed=${(usage.elapsedMs / 1000).toFixed(1)}s, ` +
      `researchCalls=${usage.researchCalls}/${limits.maxResearchCalls}, ` +
      `candidates=${usage.candidatesEvaluated}/${limits.maxCandidates}, ` +
      `testRuns=${usage.testRuns}/${limits.maxTestRuns}.`;
    console.error(`[DeepController:FSM] Terminated: ${ctx.error}`);
  } else {
    ctx.error = `Deep exploration exceeded maximum iterations (${maxIterations}).`;
    console.error(`[DeepController:FSM] Terminated: ${ctx.error}`);
  }

  return "FAILURE";
}
