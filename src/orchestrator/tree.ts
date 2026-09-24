import {
  sequence,
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
  fastImplementAction,
  verifyAction,
  compareAction,
  cleanRoomReviewAction,
  stageIntegrationAction,
  publishAction,
  learnAction,
} from "./actions.js";
import { deepControllerAction } from "./deep-controller.js";

export interface TreeOptions {
  maxExplorationAttempts?: number;
  enableTracing?: boolean;
}

/**
 * Builds the Hierarchical Autonomous Exploration Behavior Tree.
 * Macro Strategy (BT): Inspect -> Triage -> Selector(FastTrack, DeepController) -> StageIntegration -> Publish -> Learn.
 * Micro Exploration (FSM): DeepController manages arbitrary state transitions and direct backtracking jumps.
 */
export function buildHarnessBehaviorTree(options?: TreeOptions): BTNode<HarnessContext> {
  const enableTracing = options?.enableTracing ?? true;

  const wrap = <T extends BTNode<HarnessContext>>(node: T): BTNode<HarnessContext> => {
    return enableTracing ? trace(node) : node;
  };

  // Fast Track Subtree: Direct Implement -> Verify -> Compare -> Review
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

  // Deep Exploration Subtree: Managed entirely by DeepController FSM
  // Replaces rigid BT retry loops with direct, cause-driven phase transitions.
  const deepPipelineNode = wrap(action("DeepController", deepControllerAction));

  // Root Pipeline Sequence
  return wrap(
    sequence("Autonomous Architecture Exploration Pipeline", [
      wrap(action("Inspect", inspectAction)),
      wrap(action("Triage", triageAction)),
      wrap(action("Selected Execution Path", async (ctx) => {
        if (ctx.triageDecision?.path === "FAST") {
          return fastTrackSubtree.tick(ctx);
        }
        return deepPipelineNode.tick(ctx);
      })),
      wrap(action("StageIntegration", stageIntegrationAction)),
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
