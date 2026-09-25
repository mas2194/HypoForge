import type { HarnessContext } from "./context.js";
import { Phase } from "./context.js";
import type { NodeStatus } from "../bt/types.js";
import { runResearchPhase } from "../phases/research.js";
import { runArchitectPhase } from "../phases/architect.js";
import { runFalsifyPhase } from "../phases/falsify.js";
import { repairFailedCandidates, runImplementPhase } from "../phases/implement.js";
import { runCleanRoomReviewPhase } from "../phases/review.js";
import type { CandidateImplementation } from "../schemas/candidate.js";
import type { VerificationResult } from "../schemas/result.js";
import type { CandidateHypothesis } from "../schemas/diagnosis.js";
import { judgeResearchNeed } from "../phases/research-router.js";

import { evaluateDiversity, enforceDiversity } from "../phases/diversity-gate.js";
import { routeBacktrack, BacktrackTarget } from "./backtrack-router.js";
import { inspectRepository, generateProblemSignature } from "../phases/inspect-repo.js";
import { createAndSaveVerifiedMemory, promoteMemoryProvenance } from "../memory/verified-memory.js";
import { triageExecutionPath } from "../phases/triage.js";
import { AdaptiveHypothesisScheduler } from "../phases/adaptive-scheduler.js";
import {
  emitPhaseChange,
  emitSubAgentStart,
  emitSubAgentLog,
  emitSubAgentFinish,
} from "../server/events.js";

function effectiveTestCommand(ctx: HarnessContext): string | undefined {
  return ctx.testCommand;
}

export async function inspectAction(ctx: HarnessContext): Promise<NodeStatus> {
  ctx.phase = Phase.Inspect;
  emitPhaseChange(ctx, "started", "Inspecting repository topology & recalling memories");
  emitSubAgentStart(
    ctx,
    "agent-inspect",
    "Repository Inspector",
    "Analyze repo invariants, subsystem topology & recall durable memories",
    `Initializing run ${ctx.runId} for goal: "${ctx.goal}"`
  );

  if (ctx.repoInspection && ctx.problemSignature) {
    console.log(`[Phase: Inspect] Resuming from recovered repository inspection artifact.`);
    emitSubAgentFinish(
      ctx,
      "agent-inspect",
      "Repository Inspector",
      "Analyze repo invariants, subsystem topology & recall durable memories",
      "completed",
      "Resumed from recovered repository inspection artifact."
    );
    emitPhaseChange(ctx, "completed", "Inspect phase recovered");
    return "SUCCESS";
  }
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
  emitSubAgentLog(
    ctx,
    "agent-inspect",
    "Repository Inspector",
    "Analyze repo invariants, subsystem topology & recall durable memories",
    "tool",
    `Topology: ${ctx.repoInspection.targetSubsystems.length} subsystems, ${ctx.repoInspection.recentGitHistory.length} commits.`,
    { subsystems: ctx.repoInspection.targetSubsystems }
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
  emitSubAgentFinish(
    ctx,
    "agent-inspect",
    "Repository Inspector",
    "Analyze repo invariants, subsystem topology & recall durable memories",
    "completed",
    `Inspection complete. Recalled ${ctx.recalledMemories.length} memories, matched ${ctx.activeSkills.length} skills.`,
    {
      recalledMemories: ctx.recalledMemories,
      activeSkills: ctx.activeSkills.map((s) => s.name),
    }
  );
  emitPhaseChange(ctx, "completed", `Inspect complete: ${ctx.activeSkills.length} skills matched`);
  return "SUCCESS";
}

export async function triageAction(ctx: HarnessContext): Promise<NodeStatus> {
  ctx.phase = Phase.Triage;
  emitPhaseChange(ctx, "started", "Evaluating execution path: FAST or DEEP");
  emitSubAgentStart(
    ctx,
    "agent-triage",
    "Triage Gatekeeper",
    "Analyze blast radius and assign FAST or DEEP execution path",
    "Evaluating goal against repository structure..."
  );

  if (ctx.triageDecision) {
    console.log(`[Phase: Triage] Resuming from recovered triage decision: '${ctx.triageDecision.path}'.`);
    emitSubAgentFinish(
      ctx,
      "agent-triage",
      "Triage Gatekeeper",
      "Analyze blast radius and assign FAST or DEEP execution path",
      "completed",
      `Resumed path: ${ctx.triageDecision.path}`,
      { decision: ctx.triageDecision }
    );
    emitPhaseChange(ctx, "completed", `Path: ${ctx.triageDecision.path}`);
    return "SUCCESS";
  }
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

  const researchContext = JSON.stringify({
    repoLanguage: inspection.repoLanguage,
    targetSubsystems: inspection.targetSubsystems,
    keyDependencies: inspection.keyDependencies,
    previousRunResults: ctx.recoveryHistory ?? [],
  });
  const researchDecision = await judgeResearchNeed(
    ctx.goal,
    researchContext,
    ctx.codexManager,
    ctx.repoRoot
  );
  ctx.researchRouting = researchDecision;
  let decision = triageExecutionPath(ctx.goal, inspection, signature, researchDecision);
  if ((ctx.recoveryHistory?.length ?? 0) > 0 && decision.path === "FAST") {
    decision = {
      ...decision,
      path: "DEEP",
      reason: `Escalated to DEEP after a failed full-run attempt. ${decision.reason}`,
      confidence: Math.max(decision.confidence, 0.8),
      signals: [...decision.signals, "Previous run results require architectural re-evaluation"],
    };
  }
  ctx.triageDecision = decision;

  console.log(
    `[Phase: Triage] Evaluated execution path: '${decision.path}' (Confidence: ${(decision.confidence * 100).toFixed(0)}%)`
  );
  console.log(`[Phase: Triage] Reason: ${decision.reason}`);
  await ctx.executionJournal.recordPhaseComplete(ctx.runId, "Triage", ctx.iteration, { decision });

  emitSubAgentFinish(
    ctx,
    "agent-triage",
    "Triage Gatekeeper",
    "Analyze blast radius and assign FAST or DEEP execution path",
    "completed",
    `Selected path '${decision.path}' (Confidence: ${(decision.confidence * 100).toFixed(0)}%): ${decision.reason}`,
    { decision }
  );
  emitPhaseChange(ctx, "completed", `Selected path: ${decision.path}`);

  return "SUCCESS";
}


export async function researchAction(ctx: HarnessContext): Promise<NodeStatus> {
  ctx.phase = Phase.Research;
  emitPhaseChange(ctx, "started", "Surveying prior art & SOTA approaches");
  emitSubAgentStart(
    ctx,
    "agent-research",
    "Literature Researcher",
    "Conduct prior-art & literature survey on SOTA approaches",
    "Checking necessity of prior research..."
  );

  if (ctx.research) {
    console.log(
      `[Phase: Research] Resuming from recovered research artifact (${ctx.research.priorArt.length} prior art studies, ${ctx.research.sotaApproaches.length} SOTA approaches).`
    );
    emitSubAgentFinish(
      ctx,
      "agent-research",
      "Literature Researcher",
      "Conduct prior-art & literature survey on SOTA approaches",
      "completed",
      `Resumed survey: ${ctx.research.priorArt.length} prior art studies, ${ctx.research.sotaApproaches.length} SOTA approaches.`,
      { research: ctx.research }
    );
    emitPhaseChange(ctx, "completed", "Research phase recovered");
    return "SUCCESS";
  }

  // On-demand Check: Force research if explicitly routed here via Backtrack (e.g. EXTERNAL_SPEC error)
  const isBacktrackToResearch = ctx.backtrackDecision?.target === BacktrackTarget.Research;

  const decision = ctx.researchRouting ?? (ctx.triageDecision
    ? {
        shouldResearch: ctx.triageDecision.requiresResearch,
        reason: "Recovered from the Triage decision.",
        detectedSignals: ctx.triageDecision.signals,
      }
    : await judgeResearchNeed(
        ctx.goal,
        JSON.stringify({
          repoLanguage: ctx.repoInspection?.repoLanguage,
          targetSubsystems: ctx.repoInspection?.targetSubsystems,
          keyDependencies: ctx.repoInspection?.keyDependencies,
        }),
        ctx.codexManager,
        ctx.repoRoot
      ));
  ctx.researchRouting = decision;

  if (!isBacktrackToResearch && !decision.shouldResearch) {
    console.log(`[Phase: Research] Skipped on-demand: ${decision.reason}`);
    emitSubAgentFinish(
      ctx,
      "agent-research",
      "Literature Researcher",
      "Conduct prior-art & literature survey on SOTA approaches",
      "completed",
      `Skipped: ${decision.reason}`,
      { decision }
    );
    emitPhaseChange(ctx, "completed", "Research skipped on-demand");
    return "SUCCESS";
  }

  const reasonMsg = isBacktrackToResearch
    ? `Forced on-demand research by Backtrack Router (${ctx.backtrackDecision?.failureMode})`
    : `Detected signals: ${decision.detectedSignals.join(", ")}`;

  console.log(
    `[Phase: Research] Conducting literature & prior-art survey on SOTA approaches (${reasonMsg})...`
  );
  ctx.budgetTracker.recordResearchCall();
  emitSubAgentLog(
    ctx,
    "agent-research",
    "Literature Researcher",
    "Conduct prior-art & literature survey on SOTA approaches",
    "thought",
    `Conducting survey: ${reasonMsg}`
  );

  ctx.research = await runResearchPhase(
    {
      goal: ctx.goal,
      repoPath: ctx.worktreeManager.repoRoot,
      context: (ctx.recoveryHistory ?? []).join("\n\n--- Previous attempt ---\n\n"),
    },
    ctx.codexManager
  );
  await ctx.memoryManager.saveArtifact(ctx.runId, "research.json", ctx.research);
  console.log(
    `[Phase: Research] Completed survey with ${ctx.research.priorArt.length} prior art studies and ${ctx.research.sotaApproaches.length} SOTA approaches.`
  );
  emitSubAgentFinish(
    ctx,
    "agent-research",
    "Literature Researcher",
    "Conduct prior-art & literature survey on SOTA approaches",
    "completed",
    `Survey completed: ${ctx.research.priorArt.length} prior art studies, ${ctx.research.sotaApproaches.length} SOTA approaches.`,
    { research: ctx.research }
  );
  emitPhaseChange(ctx, "completed", `Research completed with ${ctx.research.sotaApproaches.length} SOTA approaches`);
  return "SUCCESS";
}

export async function compactContextAction(ctx: HarnessContext): Promise<NodeStatus> {
  ctx.compactor.compactForBacktrack(ctx);
  return "SUCCESS";
}

export async function diagnoseAction(ctx: HarnessContext): Promise<NodeStatus> {
  ctx.phase = Phase.Diagnose;
  emitPhaseChange(ctx, "started", "Diagnosing root cause & formulating hypotheses");
  emitSubAgentStart(
    ctx,
    "agent-architect",
    "System Architect",
    "Analyze root cause & formulate multi-level hypotheses across Intervention Ladder",
    "Formulating architectural hypotheses..."
  );

  if (ctx.diagnosis && ctx.diagnosis.candidates.length > 0) {
    console.log(`[Phase: Diagnose] Resuming from recovered diagnosis artifact (${ctx.diagnosis.candidates.length} candidates).`);
    emitSubAgentFinish(
      ctx,
      "agent-architect",
      "System Architect",
      "Analyze root cause & formulate multi-level hypotheses across Intervention Ladder",
      "completed",
      `Resumed ${ctx.diagnosis.candidates.length} candidate hypotheses.`,
      { diagnosis: ctx.diagnosis }
    );
    emitPhaseChange(ctx, "completed", "Diagnose phase recovered");
    return "SUCCESS";
  }
  console.log(`[Phase: Diagnose] Analyzing goal across Intervention Ladder informed by research...`);

  // Build high-signal, distilled prompt context from prior learnings, ADRs, and active skills
  const contextFeedback = ctx.compactor.buildDiagnosisPromptContext(ctx);
  if (contextFeedback) {
    console.log(`[Phase: Diagnose] Incorporating distilled feedback and constraints into diagnosis.`);
    emitSubAgentLog(
      ctx,
      "agent-architect",
      "System Architect",
      "Analyze root cause & formulate multi-level hypotheses across Intervention Ladder",
      "thought",
      "Incorporating distilled feedback and constraints into prompt context."
    );
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
  
  emitSubAgentFinish(
    ctx,
    "agent-architect",
    "System Architect",
    "Analyze root cause & formulate multi-level hypotheses across Intervention Ladder",
    "completed",
    `Generated ${ctx.diagnosis.candidates.length} candidates: ${ctx.diagnosis.candidates.map((c) => `${c.id} (${c.level})`).join(", ")}`,
    {
      rootCause: ctx.diagnosis.rootCause,
      candidates: ctx.diagnosis.candidates,
    }
  );
  emitPhaseChange(ctx, "completed", `Diagnose complete: ${ctx.diagnosis.candidates.length} candidates`);
  return "SUCCESS";
}

export async function diversityGateAction(ctx: HarnessContext): Promise<NodeStatus> {
  ctx.phase = Phase.DiversityGate;
  emitPhaseChange(ctx, "started", "Verifying exploration radius & diversity");
  emitSubAgentStart(
    ctx,
    "agent-diversity",
    "Diversity Gatekeeper",
    "Enforce multi-level exploration radius across Intervention Ladder",
    "Checking candidate diversity..."
  );

  if (!ctx.diagnosis || ctx.diagnosis.candidates.length === 0) {
    emitSubAgentFinish(
      ctx,
      "agent-diversity",
      "Diversity Gatekeeper",
      "Enforce multi-level exploration radius across Intervention Ladder",
      "failed",
      "No candidates found for diversity check."
    );
    emitPhaseChange(ctx, "failed", "Diversity check failed");
    return "FAILURE";
  }

  const evalResult = evaluateDiversity(ctx.diagnosis.candidates);
  ctx.diversityEvaluation = evalResult;

  if (evalResult.passed) {
    console.log(`[Phase: DiversityGate] ${evalResult.reason}`);
    emitSubAgentFinish(
      ctx,
      "agent-diversity",
      "Diversity Gatekeeper",
      "Enforce multi-level exploration radius across Intervention Ladder",
      "completed",
      `Passed: ${evalResult.reason}`,
      { evaluation: evalResult }
    );
    emitPhaseChange(ctx, "completed", "Diversity check passed");
    return "SUCCESS";
  }

  console.warn(`[Phase: DiversityGate] Insufficient candidate diversity: ${evalResult.reason}`);
  console.log(`[Phase: DiversityGate] Enforcing architectural diversity across candidates prior to falsification...`);

  ctx.diagnosis.candidates = enforceDiversity(ctx.diagnosis.candidates);
  const reEval = evaluateDiversity(ctx.diagnosis.candidates);
  ctx.diversityEvaluation = reEval;
  console.log(`[Phase: DiversityGate] Diversity enforced: ${reEval.reason}`);

  emitSubAgentFinish(
    ctx,
    "agent-diversity",
    "Diversity Gatekeeper",
    "Enforce multi-level exploration radius across Intervention Ladder",
    "completed",
    `Enforced: ${reEval.reason}`,
    { evaluation: reEval }
  );
  emitPhaseChange(ctx, "completed", "Diversity enforced");
  return "SUCCESS";
}

export async function falsifyAction(ctx: HarnessContext): Promise<NodeStatus> {
  if (!ctx.diagnosis) {
    console.error("[Phase: Falsify] Diagnosis missing for falsification");
    return "FAILURE";
  }
  ctx.phase = Phase.Falsify;
  emitPhaseChange(ctx, "started", "Subjecting candidates to counter-argument scrutiny");
  emitSubAgentStart(
    ctx,
    "agent-falsifier",
    "Falsification Adversary",
    "Subject candidate hypotheses to counter-arguments and adversarial tests",
    "Scrutinizing candidate hypotheses..."
  );

  if (ctx.falsifiedCandidates && ctx.falsifiedCandidates.length > 0) {
    console.log(
      `[Phase: Falsify] Resuming from recovered falsification artifact (${ctx.falsifiedCandidates.length} survivors).`
    );
    emitSubAgentFinish(
      ctx,
      "agent-falsifier",
      "Falsification Adversary",
      "Subject candidate hypotheses to counter-arguments and adversarial tests",
      "completed",
      `Resumed: ${ctx.falsifiedCandidates.length} survivor(s).`,
      { survivors: ctx.falsifiedCandidates }
    );
    emitPhaseChange(ctx, "completed", "Falsify phase recovered");
    return "SUCCESS";
  }
  console.log(`[Phase: Falsify] Subjecting candidates to rigorous counter-argument scrutiny...`);
  const { candidates, reviews } = await runFalsifyPhase(
    {
      candidates: ctx.diagnosis.candidates,
      goal: ctx.goal,
      repoPath: ctx.worktreeManager.repoRoot,
      priorResults: ctx.recoveryHistory ?? [],
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
    emitSubAgentFinish(
      ctx,
      "agent-falsifier",
      "Falsification Adversary",
      "Subject candidate hypotheses to counter-arguments and adversarial tests",
      "failed",
      "All proposed candidates were falsified during scrutiny.",
      { reviews }
    );
    emitPhaseChange(ctx, "failed", "All candidates falsified");
    return "FAILURE";
  }

  emitSubAgentFinish(
    ctx,
    "agent-falsifier",
    "Falsification Adversary",
    "Subject candidate hypotheses to counter-arguments and adversarial tests",
    "completed",
    `${ctx.falsifiedCandidates.length} candidate(s) survived for implementation: ${ctx.falsifiedCandidates.map((c) => c.id).join(", ")}`,
    { survivors: ctx.falsifiedCandidates, reviews }
  );
  emitPhaseChange(ctx, "completed", `${ctx.falsifiedCandidates.length} candidate(s) survived`);
  return "SUCCESS";
}

export async function fastImplementAction(ctx: HarnessContext): Promise<NodeStatus> {
  if (ctx.triageDecision?.path !== "FAST") {
    return "SUCCESS"; // pass-through for non-fast paths
  }

  ctx.phase = Phase.Implement;
  emitPhaseChange(ctx, "started", "Spawning single localized worktree for fast path execution");
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
    eventBus: ctx.eventBus,
    priorResults: ctx.recoveryHistory ?? [],
  });

  if (ctx.implementations.some((implementation) => implementation.status === "failed")) {
    ctx.rejectionFeedbacks.push("Fast-path implementation failed; see the full worker error in recovery history.");
    return "FAILURE";
  }

  emitPhaseChange(ctx, "completed", "FastPath implementation completed");
  return "SUCCESS";
}


export async function implementAction(ctx: HarnessContext): Promise<NodeStatus> {
  ctx.phase = Phase.Implement;
  emitPhaseChange(ctx, "started", "Spawning isolated worktrees for candidate solutions");
  const rawCandidates = ctx.falsifiedCandidates ?? ctx.diagnosis?.candidates ?? [];
  if (rawCandidates.length === 0) {
    emitPhaseChange(ctx, "failed", "No candidates available for implementation");
    return "FAILURE";
  }

  // Budget tracking: register new candidates
  ctx.budgetTracker.recordCandidates(rawCandidates.length);
  const budgetStatus = ctx.budgetTracker.checkBudget();
  if (budgetStatus.exhausted) {
    console.warn(`[BT:Budget] Exploration halted by budget limit: ${budgetStatus.reason}`);
    ctx.unresolved = true;
    ctx.unresolvedReason = budgetStatus.reason;
    emitPhaseChange(ctx, "failed", `Budget limit: ${budgetStatus.reason}`);
    return "FAILURE";
  }

  // Adaptive Hypothesis Scheduling (Bayesian Expected Information Gain per Cost):
  const scheduler = new AdaptiveHypothesisScheduler(rawCandidates);
  ctx.hypothesisScheduler = scheduler;
  const prioritized = scheduler.getPrioritizedSchedule().map((p) => p.candidate);

  console.log(
    `[Phase: Implement] Scheduling ${prioritized.length} candidate(s) via Adaptive Information Gain per Cost (${prioritized.map((c) => `${c.id} [${c.level}]`).join(", ")})`
  );

  ctx.implementations = await runImplementPhase({
    candidates: prioritized,
    worktreeManager: ctx.worktreeManager,
    codexManager: ctx.codexManager,
    runId: ctx.runId,
    eventBus: ctx.eventBus,
    priorResults: ctx.recoveryHistory ?? [],
  });

  if (ctx.implementations.some((implementation) => implementation.status === "failed")) {
    ctx.rejectionFeedbacks.push("One or more candidate implementations failed; see worker errors in recovery history.");
    emitPhaseChange(ctx, "failed", "One or more candidate implementations failed");
    return "FAILURE";
  }

  await ctx.memoryManager.saveArtifact(ctx.runId, "implementations.json", ctx.implementations);
  console.log(`[Phase: Implement] Finished implementations in isolated worktrees.`);
  emitPhaseChange(ctx, "completed", `Implemented ${ctx.implementations.length} candidate(s)`);
  return "SUCCESS";
}

import { compareWithPareto } from "../evaluator/pareto.js";

export async function verifyAction(ctx: HarnessContext): Promise<NodeStatus> {
  ctx.phase = Phase.Verify;
  emitPhaseChange(ctx, "started", "Evaluating candidates with configured checks & Hard Gates");
  emitSubAgentStart(
    ctx,
    "agent-evaluator",
    "Objective Evaluator",
    "Run configured checks and measure Hard Gates, soft metrics & regressions",
    "Evaluating baseline and worktree implementations..."
  );

  console.log(`[Phase: Verify] Independently evaluating each worktree candidate...`);
  ctx.verifications = [];

  // Only an explicitly configured command is mandatory; otherwise each candidate agent chooses its checks.
  const testCommand = effectiveTestCommand(ctx);
  if (!testCommand) {
    console.log("[Phase: Verify] No mandatory test command configured; relying on the candidate worker's validation choice.");
  }

  // 1. Evaluate Candidate 0 (main branch baseline)
  if (testCommand) ctx.budgetTracker.recordTestRun();
  const baselineResult = await ctx.evaluator.runBaselineVerification({
    repoPath: ctx.worktreeManager.repoRoot,
    testCommand,
  });
  ctx.baselineVerification = baselineResult;
  console.log(
    `  - Candidate 0 [Baseline main]: hardGates=${baselineResult.hardGates.passedAll ? "PASS" : "FAIL"}, passed=${baselineResult.tests.passed}, failed=${baselineResult.tests.failed}`
  );
  emitSubAgentLog(
    ctx,
    "agent-evaluator",
    "Objective Evaluator",
    "Execute objective test suites, measure Hard Gates, soft metrics & regressions",
    "tool",
    `Baseline [main]: HardGates=${baselineResult.hardGates.passedAll ? "PASS" : "FAIL"}, tests=${baselineResult.tests.passed}/${baselineResult.tests.passed + baselineResult.tests.failed}`,
    { baseline: baselineResult }
  );

  // 2. Evaluate all worktree candidates
  for (const impl of ctx.implementations) {
    if (testCommand) ctx.budgetTracker.recordTestRun();
    const levelMultiplier = impl.level === "redesign" ? 3 : impl.level === "subsystem" ? 2 : 1;
    const result = await ctx.evaluator.runVerification({
      candidateId: impl.candidateId,
      worktreePath: impl.worktreePath,
      testCommand,
      interventionLevel: levelMultiplier,
    });
    ctx.verifications.push(result);
    console.log(
      `  - Candidate ${impl.candidateId} (${impl.level}): hardGates=${result.hardGates.passedAll ? "PASS" : "FAIL"}, passed=${result.tests.passed}, failed=${result.tests.failed}, lines=+${result.softMetrics.addedLines}/-${result.softMetrics.deletedLines}`
    );
    emitSubAgentLog(
      ctx,
      "agent-evaluator",
      "Objective Evaluator",
      "Execute objective test suites, measure Hard Gates, soft metrics & regressions",
      "result",
      `Candidate ${impl.candidateId}: HardGates=${result.hardGates.passedAll ? "PASS" : "FAIL"}, Score=${result.score.toFixed(2)}, lines=+${result.softMetrics.addedLines}/-${result.softMetrics.deletedLines}`,
      { verification: result }
    );
  }

  // Give each candidate a bounded chance to repair its own test failures, then
  // rerun the independent verifier against the updated branch.
  const maxRepairRounds = 2;
  for (let repairRound = 1; repairRound <= maxRepairRounds; repairRound++) {
    const failedByCandidate = new Map(
      ctx.verifications
        .filter((verification) => verification.tests.failed > 0)
        .map((verification) => [verification.candidateId, verification])
    );
    if (failedByCandidate.size === 0 || !ctx.codexManager || !testCommand) break;
    if (ctx.budgetTracker.isExhausted()) {
      console.warn(`[Phase: Verify] Test-run budget exhausted; skipping candidate repair round ${repairRound}.`);
      break;
    }

    console.log(`[Phase: Verify] Asking ${failedByCandidate.size} candidate worker(s) to repair test failures (round ${repairRound}/${maxRepairRounds})...`);
    await repairFailedCandidates({
      implementations: ctx.implementations,
      failures: failedByCandidate,
      codexManager: ctx.codexManager,
      testCommand,
      eventBus: ctx.eventBus,
      repairRound,
    });

    for (const impl of ctx.implementations) {
      if (!failedByCandidate.has(impl.candidateId)) continue;
      if (ctx.budgetTracker.isExhausted()) {
        console.warn("[Phase: Verify] Test-run budget exhausted; stopping candidate re-verification.");
        break;
      }
      ctx.budgetTracker.recordTestRun();
      const result = await ctx.evaluator.runVerification({
        candidateId: impl.candidateId,
        worktreePath: impl.worktreePath,
        testCommand,
        interventionLevel: impl.level === "redesign" ? 3 : impl.level === "subsystem" ? 2 : 1,
      });
      const index = ctx.verifications.findIndex((verification) => verification.candidateId === impl.candidateId);
      if (index >= 0) ctx.verifications[index] = result;
      console.log(
        `  - Candidate ${impl.candidateId} after repair ${repairRound}: hardGates=${result.hardGates.passedAll ? "PASS" : "FAIL"}, passed=${result.tests.passed}, failed=${result.tests.failed}, lines=+${result.softMetrics.addedLines}/-${result.softMetrics.deletedLines}`
      );
    }
  }

  await ctx.memoryManager.saveArtifact(ctx.runId, "implementations.json", ctx.implementations);

  // 3. Update Adaptive Hypothesis Scheduler with experiment outcomes
  if (ctx.hypothesisScheduler) {
    for (const v of ctx.verifications) {
      const falsified = !v.hardGates.passedAll || v.tests.failed > 0;
      ctx.hypothesisScheduler.recordExperimentOutcome(v.candidateId, {
        falsified,
        testScore: v.score,
        evidenceStrength: falsified ? 0.95 : 0.85,
      });
    }
  }

  await ctx.memoryManager.saveArtifact(ctx.runId, "results.json", {
    baseline: ctx.baselineVerification,
    candidates: ctx.verifications,
  });

  emitSubAgentFinish(
    ctx,
    "agent-evaluator",
    "Objective Evaluator",
    "Execute objective test suites, measure Hard Gates, soft metrics & regressions",
    "completed",
    `Evaluated baseline and ${ctx.verifications.length} candidate(s).`,
    { verifications: ctx.verifications }
  );
  emitPhaseChange(ctx, "completed", `Verified ${ctx.verifications.length} candidate(s)`);
  return "SUCCESS";
}

export async function compareAction(ctx: HarnessContext): Promise<NodeStatus> {
  ctx.phase = Phase.Compare;
  emitPhaseChange(ctx, "started", "Ranking candidates via Pareto dominance & Hard Gates");
  emitSubAgentStart(
    ctx,
    "agent-pareto",
    "Pareto Frontier Selector",
    "Perform Hard-Gate filtering and Pareto / Lexicographic multi-objective comparison",
    "Ranking candidates..."
  );

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
      evidenceStrength: 1.0,
      confidenceScore: 1.0,
    },
    tests: { passed: 1, failed: 0, output: "", exitCode: 0, failingTestIds: [], passingTestIds: [] },
    diagnostics: { typeErrors: [], lintErrors: [] },
    acceptance: { tested: false, passed: true, verifiedCriteria: [], missingCriteria: [] },
    adversarial: { tested: false, passed: true, scenarios: {}, failureReasons: [] },
    metamorphic: { tested: false, passed: true, properties: {}, failureReasons: [] },
    oracleBreakdown: {
      layer1BaselinePassed: true,
      layer2CandidateAuthoredPassed: true,
      layer2CandidateAuthoredCount: 0,
      layer3AdversarialPassed: true,
      layer4MetamorphicPassed: true,
      oracleIndependenceSatisfied: true,
    },
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
    
    emitSubAgentFinish(
      ctx,
      "agent-pareto",
      "Pareto Frontier Selector",
      "Perform Hard-Gate filtering and Pareto / Lexicographic multi-objective comparison",
      "completed",
      `Winner identified: '${ctx.winner.implementation.candidateId}' (${ctx.winner.implementation.level}) score: ${ctx.winner.verification.score.toFixed(2)}`,
      { winner: ctx.winner, pareto }
    );
    emitPhaseChange(ctx, "completed", `Winner: ${ctx.winner.implementation.candidateId}`);
    return "SUCCESS";
  } else {
    console.log(`[Phase: Compare] No candidate passed Hard Gates or outperformed baseline.`);
    ctx.rejectionFeedbacks.push("No candidate implementation cleared Hard Gates or improved upon baseline.");
    emitSubAgentFinish(
      ctx,
      "agent-pareto",
      "Pareto Frontier Selector",
      "Perform Hard-Gate filtering and Pareto / Lexicographic multi-objective comparison",
      "failed",
      "No candidate passed Hard Gates or outperformed baseline.",
      { pareto }
    );
    emitPhaseChange(ctx, "failed", "No candidate cleared Hard Gates");
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
  emitPhaseChange(ctx, "started", "Launching clean-room blind audit");
  emitSubAgentStart(
    ctx,
    "agent-reviewer",
    "Clean-Room Auditor",
    "Verify solution invariants without author bias or self-evaluation drift",
    `Auditing anonymous candidate queue (depth: ${ctx.candidateQueue.length})...`
  );

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
      try {
        const initialRecord = await createAndSaveVerifiedMemory({
          runId: ctx.runId,
          goal: ctx.goal,
          repoRoot: ctx.worktreeManager.repoRoot,
          implementation: current.implementation,
          verification: current.verification,
          memoryManager: ctx.memoryManager,
          provenance: "CLEANROOM_APPROVED",
        });
        ctx.verifiedMemory = initialRecord;
      } catch (err) {
        console.warn("[Phase: Review] Warning creating initial verified memory:", err);
      }

      emitSubAgentFinish(
        ctx,
        "agent-reviewer",
        "Clean-Room Auditor",
        "Verify solution invariants without author bias or self-evaluation drift",
        "completed",
        `Candidate '${current.implementation.candidateId}' APPROVED: ${review.feedback}`,
        { review }
      );
      emitPhaseChange(ctx, "completed", `Candidate '${current.implementation.candidateId}' approved`);
      return "SUCCESS";
    }

    console.warn(
      `[Phase: Review] Candidate '${current.implementation.candidateId}' REJECTED by clean-room audit:`,
      review.blockingIssues
    );

    emitSubAgentLog(
      ctx,
      "agent-reviewer",
      "Clean-Room Auditor",
      "Verify solution invariants without author bias or self-evaluation drift",
      "result",
      `Candidate '${current.implementation.candidateId}' REJECTED: ${review.blockingIssues.join("; ")}`,
      { review }
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
      ctx.memoryManager.recordNegativeConstraint(
        ctx.runId,
        current.implementation.candidateId,
        issue,
        `Clean-room review rejected candidate '${current.implementation.candidateId}' (Level: ${current.implementation.level})`
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
  emitSubAgentFinish(
    ctx,
    "agent-reviewer",
    "Clean-Room Auditor",
    "Verify solution invariants without author bias or self-evaluation drift",
    "failed",
    "All candidates in queue were rejected by clean-room audit."
  );
  emitPhaseChange(ctx, "failed", "All candidates rejected by clean-room audit");
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

export async function stageIntegrationAction(ctx: HarnessContext): Promise<NodeStatus> {
  if (!ctx.winner) {
    console.error("[Phase: StageIntegration] No winner to integrate");
    return "FAILURE";
  }
  ctx.phase = Phase.Integrate;
  emitPhaseChange(ctx, "started", "Locking and verifying multi-stage commit graph");
  emitSubAgentStart(
    ctx,
    "agent-integrator",
    "Worktree Integrator",
    "Rebase, lock multi-stage commit graph and perform full integration verification",
    `Integrating winner: '${ctx.winner.implementation.candidateId}'`
  );

  ctx.compactor.compactForPhaseTransition(ctx, Phase.Integrate);

  const candidateBranch = ctx.winner.implementation.branchName;
  const worktreePath = ctx.winner.implementation.worktreePath;

  console.log(`[Phase: StageIntegration] Locking and verifying multi-stage commit graph for candidate '${ctx.winner.implementation.candidateId}'...`);

  // 1. Resolve Multi-stage Commit Graph: candidateSha, baseSha, integrationSha
  let candidateSha: string;
  try {
    candidateSha = await ctx.worktreeManager.revParse("HEAD", worktreePath);
  } catch {
    candidateSha = `cand-${Date.now()}-${ctx.winner.implementation.candidateId}`;
  }

  let baseSha: string;
  try {
    baseSha = await ctx.worktreeManager.revParse("HEAD", ctx.worktreeManager.repoRoot);
  } catch {
    baseSha = `base-${Date.now()}`;
  }

  // 2. Attempt clean rebase onto baseSha if needed to produce integrationSha
  let integrationSha = candidateSha;
  try {
    const rebaseRes = await ctx.worktreeManager.rebaseOntoBase(candidateBranch, "main", worktreePath);
    if (rebaseRes.success && rebaseRes.integrationSha) {
      integrationSha = rebaseRes.integrationSha;
      console.log(`[Phase: StageIntegration] Successfully rebased candidate onto latest main. IntegrationSha=${integrationSha}`);
    } else if (rebaseRes.error) {
      console.warn(`[Phase: StageIntegration] Rebase notice (${rebaseRes.error}); using candidateSha directly for verification.`);
    }
  } catch {
    // Non-fatal if repo is mock or not on clean git
  }

  // 3. Full Integration Verification on the exact integrationSha
  const integrationTestCommand = effectiveTestCommand(ctx);
  console.log(`[Phase: StageIntegration] Running integration verification on integrationSha ${integrationSha}${integrationTestCommand ? ` with '${integrationTestCommand}'` : " (no mandatory test command configured)"}...`);
  const integrationResult = await ctx.evaluator.runVerification({
    candidateId: `integration-${ctx.winner.implementation.candidateId}`,
    worktreePath,
    testCommand: integrationTestCommand,
  });

  if (!integrationResult.hardGates.passedAll) {
    console.error(
      `[Phase: StageIntegration] Full Integration Verification FAILED on SHA ${integrationSha}:`,
      integrationResult.hardGates.failureReasons
    );
    emitSubAgentFinish(
      ctx,
      "agent-integrator",
      "Worktree Integrator",
      "Rebase, lock multi-stage commit graph and perform full integration verification",
      "failed",
      `Integration verification failed: ${integrationResult.hardGates.failureReasons.join("; ")}`,
      { failureReasons: integrationResult.hardGates.failureReasons }
    );
    emitPhaseChange(ctx, "failed", "Integration verification failed");
    return "FAILURE";
  }

  // 4. Lock Verified Commit Graph Invariants (verifiedHeadSha == integrationSha)
  const verifiedHeadSha = integrationSha;
  ctx.verifiedCommitSha = verifiedHeadSha;
  ctx.commitGraph = {
    baseSha,
    candidateSha,
    integrationSha,
    verifiedHeadSha,
  };
  if (ctx.currentAttempt) {
    ctx.currentAttempt.commitGraph = ctx.commitGraph;
  }

  console.log(
    `[Phase: StageIntegration] Invariant Locked: baseSha=${baseSha.slice(0, 7)}, candidateSha=${candidateSha.slice(0, 7)}, verifiedHeadSha=${verifiedHeadSha.slice(0, 7)}`
  );

  ctx.evidenceStore?.addObservation({
    source: "integration:staging",
    content: `Locked multi-stage commit graph: baseSha=${baseSha}, candidateSha=${candidateSha}, verifiedHeadSha=${verifiedHeadSha}`,
    iteration: ctx.iteration,
    data: {
      candidateId: ctx.winner.implementation.candidateId,
      commitGraph: ctx.commitGraph,
    },
  });

  // Promote verified memory to LOCAL_INTEGRATION_VERIFIED
  if (ctx.verifiedMemory) {
    try {
      await promoteMemoryProvenance({
        record: ctx.verifiedMemory,
        newProvenance: "LOCAL_INTEGRATION_VERIFIED",
        memoryManager: ctx.memoryManager,
        reason: `Full Integration verification passed on SHA ${verifiedHeadSha}`,
      });
    } catch (err) {
      console.warn("[Phase: StageIntegration] Memory promotion notice:", err);
    }
  }

  // 5. Execution mode branching: PR Mode vs Local Mode
  if (ctx.targetMode === "LOCAL" || !ctx.publishPr) {
    console.log(`[Phase: StageIntegration] TargetMode=LOCAL: Applying verified candidate to workspace...`);
    const mergeResult = await ctx.worktreeManager.mergeBranch(candidateBranch);
    if (!mergeResult.success) {
      console.warn(`[Phase: StageIntegration] Merge warning: ${mergeResult.error}`);
    } else {
      console.log(`[Phase: StageIntegration] Successfully applied winner into active codebase.`);
    }
  } else {
    console.log(`[Phase: StageIntegration] TargetMode=PR: Preserving clean local workspace. Branch ready for remote push.`);
  }

  console.log(`[Phase: StageIntegration] Cleaning up transient worktrees...`);
  await ctx.worktreeManager.cleanAllWorktrees();

  emitSubAgentFinish(
    ctx,
    "agent-integrator",
    "Worktree Integrator",
    "Rebase, lock multi-stage commit graph and perform full integration verification",
    "completed",
    `Integration verified. Locked SHA: ${verifiedHeadSha}`,
    { commitGraph: ctx.commitGraph }
  );
  emitPhaseChange(ctx, "completed", "Integration verified and locked");
  return "SUCCESS";
}

// Preserve alias for backward-compatibility
export const integrateAction = stageIntegrationAction;

export async function publishAction(ctx: HarnessContext): Promise<NodeStatus> {
  if (!ctx.winner) return "FAILURE";
  ctx.phase = Phase.Publish;
  emitPhaseChange(ctx, "started", "Publishing verified candidate via GitHub PR");
  emitSubAgentStart(
    ctx,
    "agent-publisher",
    "GitHub PR Broker",
    "Reconcile PR and enforce remote SHA invariant",
    "Publishing pull request..."
  );

  const verifiedHeadSha = ctx.commitGraph?.verifiedHeadSha ?? ctx.verifiedCommitSha;

  console.log(`[Phase: Publish] Requesting GitHub Broker to reconcile Pull Request for verified SHA: ${verifiedHeadSha}...`);
  const pr = await ctx.githubBroker.createPullRequest({
    title: `[Autonomous Agent] ${ctx.goal}`,
    head: ctx.winner.implementation.branchName,
    base: "main",
    body: `## Summary\nAutonomous exploration resolved goal: "${ctx.goal}".\n- Candidate Level: ${ctx.winner.implementation.level}\n- Base SHA: \`${ctx.commitGraph?.baseSha ?? "N/A"}\`\n- Verified Commit SHA: \`${verifiedHeadSha ?? "N/A"}\`\n- Verification Score: ${ctx.winner.verification.score.toFixed(2)}`,
  });

  ctx.publishedPrUrl = pr.url;

  // Invariant verification check (remoteHeadSha == verifiedHeadSha)
  if (pr.headSha) {
    if (ctx.commitGraph) {
      ctx.commitGraph.remoteHeadSha = pr.headSha;
    }
    if (verifiedHeadSha && pr.headSha !== verifiedHeadSha) {
      console.warn(
        `[Phase: Publish] Invariant warning: PR remote SHA (${pr.headSha}) diverges from verified local SHA (${verifiedHeadSha})`
      );
    } else {
      console.log(`[Phase: Publish] Verified commit SHA matches PR target (${pr.headSha}). Invariant strictly satisfied.`);
    }
  }

  // Promote verified memory to PR_CREATED
  if (ctx.verifiedMemory) {
    try {
      await promoteMemoryProvenance({
        record: ctx.verifiedMemory,
        newProvenance: "PR_CREATED",
        memoryManager: ctx.memoryManager,
        reason: `Pull Request created on remote: ${pr.url}`,
      });
    } catch (err) {
      console.warn("[Phase: Publish] Memory promotion notice:", err);
    }
  }

  emitSubAgentFinish(
    ctx,
    "agent-publisher",
    "GitHub PR Broker",
    "Reconcile PR and enforce remote SHA invariant",
    "completed",
    `Pull Request published: ${pr.url}`,
    { prUrl: pr.url, headSha: pr.headSha }
  );
  emitPhaseChange(ctx, "completed", `PR published: ${pr.url}`);
  return "SUCCESS";
}

export async function learnAction(ctx: HarnessContext): Promise<NodeStatus> {
  ctx.phase = Phase.Learn;
  emitPhaseChange(ctx, "started", "Crystallizing durable memory, skills & ADR");
  emitSubAgentStart(
    ctx,
    "agent-learner",
    "Memory & Skill Crystallizer",
    "Synthesize ADR, persist verified memories, and crystallize procedural skills",
    "Recording Architecture Decision Record and updating SQLite FTS5..."
  );

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

    // Verified Memory Persistence & Finalization:
    // Strictly isolate empirical, machine-validated facts from subjective model thinking
    try {
      const currentSha = ctx.repoInspection?.recentGitHistory[0]?.split(" ")[0];
      if (!ctx.verifiedMemory) {
        const verifiedRecord = await createAndSaveVerifiedMemory({
          runId: ctx.runId,
          goal: ctx.goal,
          repoRoot: ctx.worktreeManager.repoRoot,
          implementation: ctx.winner.implementation,
          verification: ctx.winner.verification,
          memoryManager: ctx.memoryManager,
          provenance: ctx.publishPr ? "PR_CREATED" : "LOCAL_INTEGRATION_VERIFIED",
          validForRepoSha: currentSha,
        });
        ctx.verifiedMemory = verifiedRecord;
        console.log(`[Phase: Learn] Recorded Verified Memory in SQLite FTS5: [${verifiedRecord.id}] (Confidence: ${verifiedRecord.confidence})`);
      } else {
        console.log(
          `[Phase: Learn] Finalized Verified Memory in SQLite FTS5: [${ctx.verifiedMemory.id}] (Provenance: ${ctx.verifiedMemory.provenance}, Confidence: ${ctx.verifiedMemory.confidence})`
        );
      }
    } catch (err) {
      console.warn("[Phase: Learn] Verified memory finalization notice:", err);
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

  emitSubAgentFinish(
    ctx,
    "agent-learner",
    "Memory & Skill Crystallizer",
    "Synthesize ADR, persist verified memories, and crystallize procedural skills",
    "completed",
    `ADR saved: ${ctx.adrFilename || "none"}. Trajectory exported.`,
    {
      adrFilename: ctx.adrFilename,
      crystallizedSkill: ctx.crystallizedSkill?.id,
      verifiedMemory: ctx.verifiedMemory?.id,
    }
  );
  emitPhaseChange(ctx, "completed", "Run completed and lessons learned");

  ctx.phase = Phase.Finished;
  ctx.finished = true;
  return "SUCCESS";
}
