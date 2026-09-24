import type { HarnessContext } from "./context.js";
import { Phase } from "./context.js";
import type { NodeStatus } from "../bt/types.js";
import { runResearchPhase } from "../phases/research.js";
import { runArchitectPhase } from "../phases/architect.js";
import { runFalsifyPhase } from "../phases/falsify.js";
import { runImplementPhase } from "../phases/implement.js";
import { runCleanRoomReviewPhase } from "../phases/review.js";
import type { CandidateImplementation } from "../schemas/candidate.js";
import type { VerificationResult } from "../schemas/result.js";

export async function inspectAction(ctx: HarnessContext): Promise<NodeStatus> {
  ctx.phase = Phase.Inspect;
  console.log(`[Phase: Inspect] Initializing run ${ctx.runId} for goal: "${ctx.goal}"`);
  await ctx.memoryManager.initRun(ctx.runId, {
    goal: ctx.goal,
    timestamp: new Date().toISOString(),
    repoRoot: ctx.worktreeManager.repoRoot,
  });

  // Hermes-style Memory Retrieval: Recall historical ADRs, rejections, and learnings
  ctx.recalledMemories = ctx.memoryManager.searchMemories(ctx.goal, 3);
  if (ctx.recalledMemories.length > 0) {
    console.log(
      `[Phase: Inspect] Recalled ${ctx.recalledMemories.length} historical memory item(s) from SQLite FTS5:`
    );
    for (const mem of ctx.recalledMemories) {
      console.log(`  - [${mem.type.toUpperCase()}] ${mem.title}`);
    }
  }

  // Hermes-style Skill Matching: Check for relevant procedural skills
  ctx.activeSkills = await ctx.skillManager.matchSkills(ctx.goal, 3);
  if (ctx.activeSkills.length > 0) {
    console.log(
      `[Phase: Inspect] Matched ${ctx.activeSkills.length} crystallized procedural skill(s):`
    );
    for (const skill of ctx.activeSkills) {
      console.log(`  - ${skill.name} (trigger: ${skill.trigger})`);
    }
  }

  return "SUCCESS";
}

export async function researchAction(ctx: HarnessContext): Promise<NodeStatus> {
  ctx.phase = Phase.Research;
  console.log(`[Phase: Research] Conducting literature & prior-art survey on SOTA approaches...`);
  ctx.research = await runResearchPhase(
    { goal: ctx.goal, repoPath: ctx.worktreeManager.repoRoot },
    ctx.codexManager
  );
  await ctx.memoryManager.saveArtifact(ctx.runId, "research.json", ctx.research);
  console.log(
    `[Phase: Research] Completed survey with ${ctx.research.priorArt.length} prior art studies and ${ctx.research.sotaApproaches.length} SOTA approaches.`
  );
  return "SUCCESS";
}

export async function compactContextAction(ctx: HarnessContext): Promise<NodeStatus> {
  ctx.compactor.compactForBacktrack(ctx);
  return "SUCCESS";
}

export async function diagnoseAction(ctx: HarnessContext): Promise<NodeStatus> {
  ctx.phase = Phase.Diagnose;
  console.log(`[Phase: Diagnose] Analyzing goal across Intervention Ladder informed by research...`);

  // Build high-signal, distilled prompt context from prior learnings, ADRs, and active skills
  const contextFeedback = ctx.compactor.buildDiagnosisPromptContext(ctx);
  if (contextFeedback) {
    console.log(`[Phase: Diagnose] Incorporating distilled feedback and constraints into diagnosis.`);
  }

  ctx.diagnosis = await runArchitectPhase(
    {
      goal: ctx.goal,
      repoPath: ctx.worktreeManager.repoRoot,
      research: ctx.research,
      context: contextFeedback,
    },
    ctx.codexManager
  );
  await ctx.memoryManager.saveArtifact(ctx.runId, "diagnosis.json", ctx.diagnosis);
  console.log(`[Phase: Diagnose] Generated ${ctx.diagnosis.candidates.length} candidates.`);
  return "SUCCESS";
}

export async function falsifyAction(ctx: HarnessContext): Promise<NodeStatus> {
  if (!ctx.diagnosis) {
    console.error("[Phase: Falsify] Diagnosis missing for falsification");
    return "FAILURE";
  }
  ctx.phase = Phase.Falsify;
  console.log(`[Phase: Falsify] Subjecting candidates to rigorous counter-argument scrutiny...`);
  const { candidates, reviews } = await runFalsifyPhase(
    {
      candidates: ctx.diagnosis.candidates,
      goal: ctx.goal,
      repoPath: ctx.worktreeManager.repoRoot,
    },
    ctx.codexManager
  );
  ctx.falsifiedCandidates = candidates.filter((c) => c.worthExperimenting);
  ctx.falsificationReviews = reviews;

  await ctx.memoryManager.saveArtifact(ctx.runId, "falsification.json", {
    reviews,
    survivors: ctx.falsifiedCandidates,
  });

  console.log(
    `[Phase: Falsify] ${ctx.falsifiedCandidates.length} candidate(s) survived for parallel worktree implementation.`
  );

  if (ctx.falsifiedCandidates.length === 0) {
    console.warn("[Phase: Falsify] No candidates survived falsification review.");
    ctx.rejectionFeedbacks.push("All proposed candidates were falsified during counter-argument scrutiny.");
    return "FAILURE";
  }

  return "SUCCESS";
}

export async function implementAction(ctx: HarnessContext): Promise<NodeStatus> {
  ctx.phase = Phase.Implement;
  const candidates = ctx.falsifiedCandidates ?? ctx.diagnosis?.candidates ?? [];
  if (candidates.length === 0) {
    return "FAILURE";
  }
  console.log(`[Phase: Implement] Spawning parallel worktrees for ${candidates.length} candidate(s)...`);
  ctx.implementations = await runImplementPhase({
    candidates,
    worktreeManager: ctx.worktreeManager,
    codexManager: ctx.codexManager,
    runId: ctx.runId,
  });

  await ctx.memoryManager.saveArtifact(ctx.runId, "implementations.json", ctx.implementations);
  console.log(`[Phase: Implement] Finished implementations in isolated worktrees.`);
  return "SUCCESS";
}

export async function verifyAction(ctx: HarnessContext): Promise<NodeStatus> {
  ctx.phase = Phase.Verify;
  console.log(`[Phase: Verify] Independently evaluating each worktree candidate with objective test suites...`);
  ctx.verifications = [];

  // Determine effective test command, checking active procedural skills if testCommand not explicit
  let effectiveTestCommand = ctx.testCommand;
  if (!effectiveTestCommand && ctx.activeSkills.length > 0) {
    const skillWithCommand = ctx.activeSkills.find((s) => s.command);
    if (skillWithCommand?.command) {
      effectiveTestCommand = skillWithCommand.command;
      console.log(`[Phase: Verify] Reusing verified test command from skill '${skillWithCommand.name}': ${effectiveTestCommand}`);
    }
  }

  for (const impl of ctx.implementations) {
    const levelMultiplier = impl.level === "redesign" ? 3 : impl.level === "subsystem" ? 2 : 1;
    const result = await ctx.evaluator.runVerification({
      candidateId: impl.candidateId,
      worktreePath: impl.worktreePath,
      testCommand: effectiveTestCommand,
      interventionLevel: levelMultiplier,
    });
    ctx.verifications.push(result);
    console.log(
      `  - Candidate ${impl.candidateId} (${impl.level}): score=${result.score.toFixed(2)}, passed=${result.tests.passed}, failed=${result.tests.failed}`
    );
  }

  await ctx.memoryManager.saveArtifact(ctx.runId, "results.json", ctx.verifications);
  return "SUCCESS";
}

export async function compareAction(ctx: HarnessContext): Promise<NodeStatus> {
  ctx.phase = Phase.Compare;
  console.log(`[Phase: Compare] Ranking candidates based on objective evidence (score & ladder level)...`);
  let bestScore = -Infinity;
  let bestWinner: { implementation: CandidateImplementation; verification: VerificationResult } | undefined;

  for (const verification of ctx.verifications) {
    const impl = ctx.implementations.find((i) => i.candidateId === verification.candidateId);
    if (impl && verification.score > bestScore) {
      bestScore = verification.score;
      bestWinner = { implementation: impl, verification };
    }
  }

  if (bestWinner && bestWinner.verification.tests.failed === 0) {
    ctx.winner = bestWinner;
    console.log(
      `[Phase: Compare] Winner candidate selected: ${bestWinner.implementation.candidateId} (score: ${bestWinner.verification.score.toFixed(2)})`
    );
    return "SUCCESS";
  } else {
    console.log(`[Phase: Compare] No candidate passed verification without errors.`);
    ctx.rejectionFeedbacks.push("No candidate implementation passed the test suite without failures.");
    return "FAILURE";
  }
}

export async function cleanRoomReviewAction(ctx: HarnessContext): Promise<NodeStatus> {
  if (!ctx.winner) {
    return "FAILURE";
  }
  ctx.phase = Phase.Review;
  console.log(`[Phase: Review] Launching clean-room audit without conversational context...`);
  ctx.review = await runCleanRoomReviewPhase(
    {
      goal: ctx.goal,
      implementation: ctx.winner.implementation,
      verification: ctx.winner.verification,
      repoPath: ctx.worktreeManager.repoRoot,
    },
    ctx.codexManager
  );

  await ctx.memoryManager.saveArtifact(ctx.runId, "review.json", ctx.review);

  if (ctx.review.approved) {
    console.log(`[Phase: Review] Clean-room audit APPROVED the changes.`);
    return "SUCCESS";
  } else {
    console.warn(`[Phase: Review] Clean-room audit REJECTED changes:`, ctx.review.blockingIssues);
    return "FAILURE";
  }
}

export async function captureRejectionFeedbackAction(ctx: HarnessContext): Promise<NodeStatus> {
  if (ctx.review && !ctx.review.approved && ctx.review.blockingIssues.length > 0) {
    for (const issue of ctx.review.blockingIssues) {
      ctx.rejectionFeedbacks.push(`Clean-room review rejected candidate: ${issue}`);
      // Record rejection in SQLite FTS5 memory
      if (ctx.winner) {
        ctx.memoryManager.recordRejectionFeedback(
          ctx.runId,
          ctx.winner.implementation.candidateId,
          issue
        );
      }
    }
    console.log(
      `[BT:Self-Healing] Captured ${ctx.review.blockingIssues.length} review blocking issue(s) for next exploration iteration and indexed in memory.`
    );
  }

  // Clean worktrees to prepare for retry
  try {
    await ctx.worktreeManager.cleanAllWorktrees();
  } catch (err) {
    console.warn("[BT:Self-Healing] Warning cleaning worktrees during backtrack:", err);
  }

  // Return FAILURE so that the sequence fails and the RetryNode repeats
  return "FAILURE";
}

export async function integrateAction(ctx: HarnessContext): Promise<NodeStatus> {
  if (!ctx.winner) {
    console.error("[Phase: Integrate] No winner to integrate");
    return "FAILURE";
  }
  ctx.phase = Phase.Integrate;
  ctx.compactor.compactForPhaseTransition(ctx, Phase.Integrate);
  console.log(`[Phase: Integrate] Merging winning branch '${ctx.winner.implementation.branchName}'...`);
  const mergeResult = await ctx.worktreeManager.mergeBranch(ctx.winner.implementation.branchName);
  if (!mergeResult.success) {
    console.warn(`[Phase: Integrate] Merge warning: ${mergeResult.error}`);
  } else {
    console.log(`[Phase: Integrate] Successfully integrated winner into active codebase.`);
  }

  console.log(`[Phase: Integrate] Cleaning up worktrees...`);
  await ctx.worktreeManager.cleanAllWorktrees();
  return "SUCCESS";
}

export async function publishAction(ctx: HarnessContext): Promise<NodeStatus> {
  if (!ctx.winner) return "FAILURE";
  ctx.phase = Phase.Publish;
  console.log(`[Phase: Publish] Requesting GitHub Broker to handle Pull Request creation...`);
  const pr = await ctx.githubBroker.createPullRequest({
    title: `[Autonomous Agent] ${ctx.goal}`,
    head: ctx.winner.implementation.branchName,
    base: "main",
    body: `## Summary\nAutonomous exploration resolved goal: "${ctx.goal}".\n- Candidate Level: ${ctx.winner.implementation.level}\n- Verification Score: ${ctx.winner.verification.score.toFixed(2)}`,
  });
  ctx.publishedPrUrl = pr.url;
  return "SUCCESS";
}

export async function learnAction(ctx: HarnessContext): Promise<NodeStatus> {
  ctx.phase = Phase.Learn;
  if (ctx.winner) {
    console.log(`[Phase: Learn] Recording Architecture Decision Record (ADR) in repository...`);
    const contextText = ctx.research?.problemClassification
      ? `Domain: ${ctx.research.problemClassification}. SOTA approach: ${ctx.research.sotaApproaches[0]?.technique ?? "N/A"}. Investigated alternatives via parallel worktrees across the Intervention Ladder.`
      : `Goal required solving: ${ctx.goal}. Investigated alternatives via parallel worktrees across the Intervention Ladder.`;

    const adrFile = await ctx.memoryManager.recordDecisionRecord(
      ctx.goal,
      contextText,
      `Selected candidate "${ctx.winner.implementation.candidateId}" (Level: ${ctx.winner.implementation.level}) based on objective verification score: ${ctx.winner.verification.score.toFixed(2)}.`,
      `Clean-room review verified no architecture regressions.`,
      ctx.runId
    );
    ctx.adrFilename = adrFile;
    console.log(`[Phase: Learn] Recorded ADR: ${adrFile} (Indexed in SQLite FTS5)`);

    // Hermes-style Skill Crystallization:
    // If a custom or verified test command was successfully used, crystallize it as a reusable skill
    if (ctx.testCommand) {
      try {
        const skill = await ctx.skillManager.crystallizeSkill({
          name: `Verification for ${ctx.goal.slice(0, 30)}`,
          description: `Verified test command procedure for tasks targeting: "${ctx.goal}"`,
          trigger: ctx.goal.slice(0, 30).toLowerCase(),
          command: ctx.testCommand,
          instructions: `Run command "${ctx.testCommand}" in isolated worktree for objective verification.`,
          tags: ["verification", "test", "crystallized"],
        });
        ctx.crystallizedSkill = skill;
        console.log(`[Phase: Learn] Crystallized procedural skill: "${skill.name}" (${skill.id})`);
      } catch (err) {
        console.warn("[Phase: Learn] Skill crystallization warning:", err);
      }
    }

    // Hermes-style Trajectory Export:
    // Save run trajectory and candidate preference pairs (DPO-compatible)
    try {
      const trajPath = await ctx.trajectoryExporter.exportRunTrajectory(ctx);
      ctx.exportedTrajectoryPath = trajPath;
      console.log(`[Phase: Learn] Exported full run trajectory with preference pairs to ${trajPath}`);
    } catch (err) {
      console.warn("[Phase: Learn] Trajectory export warning:", err);
    }
  }

  await ctx.memoryManager.saveArtifact(ctx.runId, "final.json", {
    runId: ctx.runId,
    goal: ctx.goal,
    winner: ctx.winner,
    review: ctx.review,
    adr: ctx.adrFilename,
    crystallizedSkill: ctx.crystallizedSkill?.id,
    trajectory: ctx.exportedTrajectoryPath,
    compactionCount: ctx.compactionRecords?.length ?? 0,
    distilledLessonCount: ctx.distilledLessons?.length ?? 0,
    finishedAt: new Date().toISOString(),
  });

  ctx.phase = Phase.Finished;
  ctx.finished = true;
  return "SUCCESS";
}
