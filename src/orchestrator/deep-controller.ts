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
import { routeBacktrack, BacktrackTarget } from "./backtrack-router.js";

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

  // 1. Dynamic Entry: Route to RESEARCH only if required by Triage or external spec uncertainty
  const requiresResearch = ctx.triageDecision?.requiresResearch ?? false;
  let nextPhase: DeepPhase = requiresResearch ? "RESEARCH" : "DIAGNOSE";

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
          console.warn("[DeepController:FSM] Research failed or timed out. Proceeding to Diagnose with baseline priors.");
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
          console.warn("[DeepController:FSM] Diversity Gate disqualified candidate set. Regrouping hypotheses in Diagnose.");
          nextPhase = "DIAGNOSE";
          break;
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
          console.warn("[DeepController:FSM] All hypotheses were falsified. Backtracking to Diagnose for fresh formulation.");
          nextPhase = "DIAGNOSE";
          break;
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
          console.warn("[DeepController:FSM] Verification runner encountered system error.");
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
          // All candidates disqualified by Hard Gates
          console.warn("[DeepController:FSM] All candidates failed Hard Gates or baseline comparison.");
          const allRejectionReasons = [
            ...ctx.rejectionFeedbacks,
            "All candidate implementations failed Hard Gates.",
          ];
          const recentEvidenceIds = ctx.evidenceStore?.getAllObservations().slice(-5).map((o) => o.id) ?? [];
          const decision = routeBacktrack(allRejectionReasons, undefined, {
            evidenceIds: recentEvidenceIds,
            diagnostics: {
              iteration: ctx.iteration,
              source: "compare_failure",
            },
          });
          ctx.backtrackDecision = decision;
          ctx.budgetTracker.recordBacktrack(decision.target);
          ctx.evidenceStore?.addDecision({
            source: "backtrack_router:compare",
            content: `Diagnosed ${decision.failureClass} (${decision.failureMode}) -> Routed to [Phase: ${decision.target}] (Confidence: ${(decision.confidence * 100).toFixed(0)}%)`,
            iteration: ctx.iteration,
            data: { decision },
          });

          // Direct jump via Backtrack Router
          nextPhase = mapTargetToDeepPhase(decision.target);
          ctx.iteration++;
          await ctx.currentAttempt.rollbackTransientState();
          ctx.compactor.compactForBacktrack(ctx, decision.target);
          break;
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
        const allRejectionReasons = [
          ...ctx.rejectionFeedbacks,
          ...(ctx.review?.blockingIssues ?? []),
        ];
        const recentEvidenceIds = ctx.evidenceStore?.getAllObservations().slice(-5).map((o) => o.id) ?? [];
        const decision = routeBacktrack(allRejectionReasons, ctx.review?.failureClass, {
          evidenceIds: recentEvidenceIds,
          diagnostics: {
            iteration: ctx.iteration,
            failureClass: ctx.review?.failureClass,
            blockingIssuesCount: ctx.review?.blockingIssues?.length ?? 0,
          },
        });
        ctx.backtrackDecision = decision;
        ctx.budgetTracker.recordBacktrack(decision.target);
        ctx.evidenceStore?.addDecision({
          source: "backtrack_router:review",
          content: `Diagnosed ${decision.failureClass} (${decision.failureMode}) -> Routed to [Phase: ${decision.target}] (Confidence: ${(decision.confidence * 100).toFixed(0)}%)`,
          iteration: ctx.iteration,
          data: { decision },
        });

        console.log(
          `[DeepController:Backtrack] Router mapped failure '${decision.failureMode}' directly to Phase: [${decision.target}] (Confidence: ${(decision.confidence * 100).toFixed(0)}%)`
        );
        console.log(`[DeepController:Backtrack] Recommendation: ${decision.recommendedAction}`);

        // Direct state transition to the targeted phase!
        nextPhase = mapTargetToDeepPhase(decision.target);
        ctx.iteration++;
        await ctx.currentAttempt.rollbackTransientState();
        ctx.compactor.compactForBacktrack(ctx, decision.target);
        break;
      }
    }
  }

  if (ctx.budgetTracker.isExhausted()) {
    console.error("[DeepController:FSM] Terminated: Exploration budget exhausted.");
  } else {
    console.error(`[DeepController:FSM] Terminated: Exceeded maximum iterations (${maxIterations}).`);
  }

  return "FAILURE";
}
