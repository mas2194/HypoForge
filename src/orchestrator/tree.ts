import {
  sequence,
  selector,
  retry,
  guard,
  optional,
  action,
  trace,
  type BTNode,
} from "../bt/index.js";
import type { HarnessContext } from "./context.js";
import {
  inspectAction,
  triageAction,
  researchAction,
  diagnoseAction,
  diversityGateAction,
  falsifyAction,
  fastImplementAction,
  implementAction,
  verifyAction,
  compareAction,
  cleanRoomReviewAction,
  captureRejectionFeedbackAction,
  compactContextAction,
  integrateAction,
  publishAction,
  learnAction,
} from "./actions.js";

export interface TreeOptions {
  maxExplorationAttempts?: number;
  enableTracing?: boolean;
}

export function buildHarnessBehaviorTree(options?: TreeOptions): BTNode<HarnessContext> {
  const maxAttempts = options?.maxExplorationAttempts ?? 2;
  const enableTracing = options?.enableTracing ?? true;

  const wrap = <T extends BTNode<HarnessContext>>(node: T): BTNode<HarnessContext> => {
    return enableTracing ? trace(node) : node;
  };

  // Deep Subtree: Diagnose -> DiversityGate -> Falsify -> Implement -> Verify -> Compare -> Review Gate
  // NOTE: DiversityGate strictly precedes Falsification. Survivors of counter-arguments are respected.
  const exploreAndValidateSubtree = sequence("Explore, Implement & Validate", [
    wrap(action("Diagnose", diagnoseAction)),
    wrap(action("DiversityGate", diversityGateAction)),
    wrap(action("Falsify", falsifyAction)),
    wrap(action("Implement", implementAction)),
    wrap(action("Verify", verifyAction)),
    wrap(action("Compare", compareAction)),
    wrap(
      selector("Review Gate & Backtrack", [
        wrap(action("CleanRoomReview", cleanRoomReviewAction)),
        wrap(action("CaptureRejectionFeedback", captureRejectionFeedbackAction)),
      ])
    ),
  ]);

  // Self-Healing Retry Decorator with Context Compaction and Backtrack Routing
  const selfHealingLoop = retry(
    maxAttempts,
    "Self-Healing Exploration Loop",
    exploreAndValidateSubtree,
    (attempt, ctx) => {
      ctx.iteration = attempt + 1;
      const target = ctx.backtrackDecision?.target ?? "Diagnose";
      // Compact and distill blackboard context upon backtracking
      ctx.compactor.compactForBacktrack(ctx);
      console.log(
        `\n[BT:Self-Healing] === Backtracking to ${target} for Iteration ${ctx.iteration}/${maxAttempts} (Context Compacted) ===`
      );
    }
  );

  // Fast Track Subtree: Direct Implement -> Verify -> Compare -> Review
  // If fast path fails at any point, Selector falls back to Deep Pipeline.
  const fastTrackSubtree = sequence("FastTrack Execution", [
    wrap(
      guard(
        (ctx) => ctx.triageDecision?.path === "FAST",
        wrap(action("FastImplement", fastImplementAction)),
        "RequireFastPath"
      )
    ),
    wrap(action("Verify", verifyAction)),
    wrap(action("Compare", compareAction)),
    wrap(action("CleanRoomReview", cleanRoomReviewAction)),
  ]);

  const deepPipelineSubtree = sequence("Deep Exploration Pipeline", [
    wrap(action("Research", researchAction)),
    wrap(selfHealingLoop),
  ]);

  // Root Pipeline Sequence
  return wrap(
    sequence("Autonomous Architecture Exploration Pipeline", [
      wrap(action("Inspect", inspectAction)),
      wrap(action("Triage", triageAction)),
      wrap(
        selector("Fast / Deep Execution Path", [
          wrap(fastTrackSubtree),
          wrap(deepPipelineSubtree),
        ])
      ),
      wrap(action("Integrate", integrateAction)),
      wrap(
        optional(
          "Publish PR",
          wrap(
            guard(
              (ctx) => Boolean(ctx.publishPr),
              wrap(action("Publish", publishAction)),
              "CheckPublishPrFlag"
            )
          )
        )
      ),
      wrap(action("Learn", learnAction)),
    ])
  );
}

