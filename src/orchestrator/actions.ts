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
import type { CandidateHypothesis } from "../schemas/diagnosis.js";
import { routeResearch } from "../phases/research-router.js";

import { evaluateDiversity, enforceDiversity } from "../phases/diversity-gate.js";
import { routeBacktrack } from "./backtrack-router.js";
import { inspectRepository, generateProblemSignature } from "../phases/inspect-repo.js";
import { createAndSaveVerifiedMemory } from "../memory/verified-memory.js";
import { triageExecutionPath } from "../phases/triage.js";

export async function inspectAction(ctx: HarnessContext): Promise<NodeStatus> {
  ctx.phase = Phase.Inspect;
  console.log(`[Phase: Inspect] Initializing run ${ctx.runId} for goal: "${ctx.goal}"`);
  await ctx.executionJournal.recordPhaseStart(ctx.runId, "Inspect", ctx.iteration);
  await ctx.memoryManager.initRun(ctx.runId, {
    goal: ctx.goal,
    timestamp: new Date().toISOString(),
    repoRoot: ctx.worktreeManager.repoRoot,
  });

  // Step 1: Pre-Memory Repository Inspection (Structure, Invariants, Git history)
  console.log(`[Phase: Inspect] Inspecting repository topology and invariants prior to memory retrieval...`);
  ctx.repoInspection = await inspectRepository(ctx.worktreeManager.repoRoot);
  console.log(
    `[Phase: Inspect] Topology inspected: ${ctx.repoInspection.targetSubsystems.length} subsystem(s), ${ctx.repoInspection.recentGitHistory.length} recent commits.`
  );

  // Step 2: Problem Signature Generation (Prevents Memory Anchoring)
  ctx.problemSignature = generateProblemSignature(ctx.goal, ctx.repoInspection);
  console.log(
    `[Phase: Inspect] Generated problem signature: domain='${ctx.problemSignature.domain}', searchTerms='${ctx.problemSignature.searchTerms}'`
  );

  // Step 3: Targeted Memory Retrieval based on Problem Signature
  ctx.recalledMemories = ctx.memoryManager.searchMemories(ctx.problemSignature.searchTerms, 3);
  if (ctx.recalledMemories.length > 0) {
    console.log(
      `[Phase: Inspect] Recalled ${ctx.recalledMemories.length} historical memory item(s) from SQLite FTS5 (Signature-targeted):`
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

  await ctx.executionJournal.recordPhaseComplete(ctx.runId, "Inspect", ctx.iteration);
  return "SUCCESS";
}

export async function triageAction(ctx: HarnessContext): Promise<NodeStatus> {
  ctx.phase = Phase.Triage;
  const inspection = ctx.repoInspection ?? {
    recentGitHistory: [],
    changedFiles: [],
    keyDependencies: [],
    targetSubsystems: [],
    repoLanguage: "typescript",
  };
  const signature = ctx.problemSignature ?? {
    signatureId: `sig-${Date.now()}`,
    domain: "core",
    relevantModules: [],
    searchTerms: ctx.goal,
  };

  const decision = triageExecutionPath(ctx.goal, inspection, signature);
  ctx.triageDecision = decision;

  console.log(
    `[Phase: Triage] Evaluated execution path: '${decision.path}' (Confidence: ${(decision.confidence * 100).toFixed(0)}%)`
  );
  console.log(`[Phase: Triage] Reason: ${decision.reason}`);
  await ctx.executionJournal.recordPhaseComplete(ctx.runId, "Triage", ctx.iteration, { decision });

  return "SUCCESS";
}


export async function researchAction(ctx: HarnessContext): Promise<NodeStatus> {
  ctx.phase = Phase.Research;
  const decision = routeResearch(ctx.goal);
  ctx.researchRouting = decision;

  if (!decision.shouldResearch) {
    console.log(`[Phase: Research] Skipped: ${decision.reason}`);
    return "SUCCESS";
  }

  console.log(
    `[Phase: Research] Conducting literature & prior-art survey on SOTA approaches (${decision.detectedSignals.join(", ")})...`
  );
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

export async function diversityGateAction(ctx: HarnessContext): Promise<NodeStatus> {

  ctx.phase = Phase.DiversityGate;
  if (!ctx.diagnosis || ctx.diagnosis.candidates.length === 0) {
    return "FAILURE";
  }

  const evalResult = evaluateDiversity(ctx.diagnosis.candidates);
  ctx.diversityEvaluation = evalResult;

  if (evalResult.passed) {
    console.log(`[Phase: DiversityGate] ${evalResult.reason}`);
    return "SUCCESS";
  }

  console.warn(`[Phase: DiversityGate] Insufficient candidate diversity: ${evalResult.reason}`);
  console.log(`[Phase: DiversityGate] Enforcing architectural diversity across candidates prior to falsification...`);

  ctx.diagnosis.candidates = enforceDiversity(ctx.diagnosis.candidates);
  const reEval = evaluateDiversity(ctx.diagnosis.candidates);
  ctx.diversityEvaluation = reEval;
  console.log(`[Phase: DiversityGate] Diversity enforced: ${reEval.reason}`);
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
  // Survivors of falsification scrutiny
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

export async function fastImplementAction(ctx: HarnessContext): Promise<NodeStatus> {
  if (ctx.triageDecision?.path !== "FAST") {
    return "SUCCESS"; // pass-through for non-fast paths
  }

  ctx.phase = Phase.Implement;
  console.log(`[Phase: Implement (FastPath)] Spawning single localized worktree for fast path execution...`);

  const fastCandidate: CandidateHypothesis = {
    id: "cand-fast",
    level: "L1_function_implementation",
    levelNumber: 1,
    hypothesis: `[FastPath] Direct localized fix for: ${ctx.goal}`,
    strategy: "local_patch",
    experiment: "Direct targeted patch",
    worthExperimenting: true,
    evidenceFor: ["Routine localized task identified by Triage"],
    evidenceAgainst: [],
  };

  ctx.budgetTracker.recordCandidates(1);
  ctx.implementations = await runImplementPhase({
    candidates: [fastCandidate],
    worktreeManager: ctx.worktreeManager,
    codexManager: ctx.codexManager,
    runId: ctx.runId,
  });

  return "SUCCESS";
}


export async function implementAction(ctx: HarnessContext): Promise<NodeStatus> {
  ctx.phase = Phase.Implement;
  const candidates = ctx.falsifiedCandidates ?? ctx.diagnosis?.candidates ?? [];
  if (candidates.length === 0) {
    return "FAILURE";
  }

  // Budget tracking: register new candidates
  ctx.budgetTracker.recordCandidates(candidates.length);
  const budgetStatus = ctx.budgetTracker.checkBudget();
  if (budgetStatus.exhausted) {
    console.warn(`[BT:Budget] Exploration halted by budget limit: ${budgetStatus.reason}`);
    ctx.unresolved = true;
    ctx.unresolvedReason = budgetStatus.reason;
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

import { compareWithPareto } from "../evaluator/pareto.js";

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

  // 1. Evaluate Candidate 0 (main branch baseline)
  ctx.budgetTracker.recordTestRun();
  const baselineResult = await ctx.evaluator.runBaselineVerification({
    repoPath: ctx.worktreeManager.repoRoot,
    testCommand: effectiveTestCommand,
  });
  ctx.baselineVerification = baselineResult;
  console.log(
    `  - Candidate 0 [Baseline main]: hardGates=${baselineResult.hardGates.passedAll ? "PASS" : "FAIL"}, passed=${baselineResult.tests.passed}, failed=${baselineResult.tests.failed}`
  );

  // 2. Evaluate all worktree candidates
  for (const impl of ctx.implementations) {
    ctx.budgetTracker.recordTestRun();
    const levelMultiplier = impl.level === "redesign" ? 3 : impl.level === "subsystem" ? 2 : 1;
    const result = await ctx.evaluator.runVerification({
      candidateId: impl.candidateId,
      worktreePath: impl.worktreePath,
      testCommand: effectiveTestCommand,
      interventionLevel: levelMultiplier,
    });
    ctx.verifications.push(result);
    console.log(
      `  - Candidate ${impl.candidateId} (${impl.level}): hardGates=${result.hardGates.passedAll ? "PASS" : "FAIL"}, passed=${result.tests.passed}, failed=${result.tests.failed}, lines=+${result.softMetrics.addedLines}/-${result.softMetrics.deletedLines}`
    );
  }

  await ctx.memoryManager.saveArtifact(ctx.runId, "results.json", {
    baseline: ctx.baselineVerification,
    candidates: ctx.verifications,
  });
  return "SUCCESS";
}

export async function compareAction(ctx: HarnessContext): Promise<NodeStatus> {
  ctx.phase = Phase.Compare;
  console.log(`[Phase: Compare] Performing Hard-Gate filtering and Pareto / Lexicographic comparison...`);

  const candidatesWithImpl = ctx.implementations
    .map((impl) => {
      const verification = ctx.verifications.find((v) => v.candidateId === impl.candidateId);
      return verification ? { implementation: impl, verification } : null;
    })
    .filter((c): c is { implementation: CandidateImplementation; verification: VerificationResult } => Boolean(c));

  const baseline = ctx.baselineVerification ?? {
    candidateId: "baseline-0",
    isBaseline: true,
    hardGates: {
      testsPassed: true,
      noRegressions: true,
      typecheckPassed: true,
      lintPassed: true,
      testIntegrityPassed: true,
      passedAll: true,
      failureReasons: [],
    },

    softMetrics: {
      performanceImprovementPercent: 0,
      complexityDelta: 0,
      addedLines: 0,
      deletedLines: 0,
      fileCount: 0,
      architecturalInterventionLevel: 0,
      confidenceScore: 1.0,
    },
    tests: { passed: 1, failed: 0, output: "", exitCode: 0 },
    regressions: [],
    score: 100,
  };

  const pareto = compareWithPareto(candidatesWithImpl, baseline);
  ctx.paretoComparison = pareto;
  ctx.candidateQueue = pareto.rankedQueue;

  if (pareto.disqualified.length > 0) {
    console.warn(`[Phase: Compare] Hard Gates disqualified ${pareto.disqualified.length} candidate(s):`);
    for (const dis of pareto.disqualified) {
      console.warn(`    - ${dis.candidate.implementation.candidateId}: ${dis.reasons.join(", ")}`);
    }
  }

  if (pareto.rankedQueue.length > 0) {
    ctx.winner = pareto.rankedQueue[0];
    console.log(
      `[Phase: Compare] ${pareto.summary} Leading candidate: '${ctx.winner.implementation.candidateId}' (${ctx.winner.implementation.level})`
    );
    await ctx.memoryManager.saveArtifact(ctx.runId, "pareto-ranking.json", pareto);
    return "SUCCESS";
  } else {
    console.log(`[Phase: Compare] No candidate passed Hard Gates or outperformed baseline.`);
    ctx.rejectionFeedbacks.push("No candidate implementation cleared Hard Gates or improved upon baseline.");
    return "FAILURE";
  }
}

export async function cleanRoomReviewAction(ctx: HarnessContext): Promise<NodeStatus> {
  if (!ctx.candidateQueue || ctx.candidateQueue.length === 0) {
    if (ctx.winner) {
      ctx.candidateQueue = [ctx.winner];
    } else {
      return "FAILURE";
    }
  }

  ctx.phase = Phase.Review;

  // Process candidates in queue sequentially until one is APPROVED
  while (ctx.candidateQueue.length > 0) {
    const current = ctx.candidateQueue[0];
    ctx.winner = current;

    console.log(
      `[Phase: Review] Launching clean-room blind audit for anonymous candidate (queue depth: ${ctx.candidateQueue.length})...`
    );

    const review = await runCleanRoomReviewPhase(
      {
        goal: ctx.goal,
        implementation: current.implementation,
        verification: current.verification,
        repoPath: ctx.worktreeManager.repoRoot,
      },
      ctx.codexManager
    );

    ctx.review = review;
    await ctx.memoryManager.saveArtifact(
      ctx.runId,
      `review-${current.implementation.candidateId}.json`,
      review
    );
    await ctx.memoryManager.saveArtifact(ctx.runId, "review.json", review);

    if (review.approved) {
      console.log(
        `[Phase: Review] Candidate '${current.implementation.candidateId}' APPROVED by clean-room audit.`
      );
      return "SUCCESS";
    }

    console.warn(
      `[Phase: Review] Candidate '${current.implementation.candidateId}' REJECTED by clean-room audit:`,
      review.blockingIssues
    );

    // Record rejected candidate & feedback
    ctx.rejectedCandidates.push({
      candidate: current,
      blockingIssues: review.blockingIssues,
    });
    for (const issue of review.blockingIssues) {
      ctx.rejectionFeedbacks.push(`Clean-room review rejected candidate ${current.implementation.candidateId}: ${issue}`);
      ctx.memoryManager.recordRejectionFeedback(
        ctx.runId,
        current.implementation.candidateId,
        issue
      );
    }

    // Pop the rejected candidate from the queue
    ctx.candidateQueue.shift();

    if (ctx.candidateQueue.length > 0) {
      console.log(
        `[Phase: Review] Falling back to next candidate in queue: '${ctx.candidateQueue[0].implementation.candidateId}'`
      );
    }
  }

  // All candidates in the queue were rejected
  console.warn(`[Phase: Review] All candidates in queue were rejected by clean-room audit.`);
  ctx.winner = undefined;
  return "FAILURE";
}

export async function captureRejectionFeedbackAction(ctx: HarnessContext): Promise<NodeStatus> {
  const rejectedCount = ctx.rejectedCandidates.length;
  if (rejectedCount > 0) {
    console.log(
      `[BT:Self-Healing] Captured feedback from ${rejectedCount} rejected candidate(s) for next exploration iteration and indexed in memory.`
    );
  }

  // Analyze failure patterns and determine intelligent backtrack recovery target
  const allRejectionReasons = [
    ...ctx.rejectionFeedbacks,
    ...(ctx.review?.blockingIssues ?? []),
  ];
  const decision = routeBacktrack(allRejectionReasons, ctx.review?.failureClass);
  ctx.backtrackDecision = decision;
  ctx.budgetTracker.recordBacktrack(decision.target);

  console.log(
    `[BT:BacktrackRouter] Diagnosed failure mode: '${decision.failureMode}' -> Routing recovery to [Phase: ${decision.target}]`
  );
  console.log(`[BT:BacktrackRouter] Action: ${decision.recommendedAction}`);


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

    // Verified Memory Persistence:
    // Strictly isolate empirical, machine-validated facts from subjective model thinking
    try {
      const currentSha = ctx.repoInspection?.recentGitHistory[0]?.split(" ")[0];
      const verifiedRecord = await createAndSaveVerifiedMemory({
        runId: ctx.runId,
        goal: ctx.goal,
        repoRoot: ctx.worktreeManager.repoRoot,
        implementation: ctx.winner.implementation,
        verification: ctx.winner.verification,
        memoryManager: ctx.memoryManager,
        provenance: "MACHINE_VERIFIED",
        validForRepoSha: currentSha,
      });
      ctx.verifiedMemory = verifiedRecord;
      console.log(`[Phase: Learn] Recorded Verified Memory in SQLite FTS5: [${verifiedRecord.id}] (Confidence: ${verifiedRecord.confidence})`);

    } catch (err) {
      console.warn("[Phase: Learn] Verified memory creation warning:", err);
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
    verifiedMemory: ctx.verifiedMemory?.id,
    trajectory: ctx.exportedTrajectoryPath,
    budgetUsage: ctx.budgetTracker.getUsage(),
    compactionCount: ctx.compactionRecords?.length ?? 0,
    distilledLessonCount: ctx.distilledLessons?.length ?? 0,
    finishedAt: new Date().toISOString(),
  });

  ctx.phase = Phase.Finished;
  ctx.finished = true;
  return "SUCCESS";
}
