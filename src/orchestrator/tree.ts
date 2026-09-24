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
  researchAction,
  diagnoseAction,
  falsifyAction,
  implementAction,
  verifyAction,
  compareAction,
  cleanRoomReviewAction,
  captureRejectionFeedbackAction,
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

  // Subtree: Diagnose -> Falsify -> Implement -> Verify -> Compare -> Review Gate
  const exploreAndValidateSubtree = sequence("Explore, Implement & Validate", [
    wrap(action("Diagnose", diagnoseAction)),
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

  // Self-Healing Retry Decorator
  const selfHealingLoop = retry(
    maxAttempts,
    "Self-Healing Exploration Loop",
    exploreAndValidateSubtree,
    (attempt, ctx) => {
      ctx.iteration = attempt + 1;
      console.log(
        `\n[BT:Self-Healing] === Backtracking to Diagnose for Iteration ${ctx.iteration}/${maxAttempts} ===`
      );
    }
  );

  // Root Pipeline Sequence
  return wrap(
    sequence("Autonomous Architecture Exploration Pipeline", [
      wrap(action("Inspect", inspectAction)),
      wrap(action("Research", researchAction)),
      wrap(selfHealingLoop),
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
