import path from "node:path";
import fs from "node:fs/promises";
import type { ExecutionJournal, JournalEntry } from "./execution-journal.js";
import type { WorktreeManager } from "../git/worktree.js";
import type { DurableMemoryManager } from "../memory/durable-memory.js";
import type { VerifiedCommitGraph, HarnessContext } from "../orchestrator/context.js";
import { Phase } from "../orchestrator/context.js";

export interface ReconciledRunState {
  runId: string;
  resumable: boolean;
  lastCompletedPhase?: string;
  nextPhase?: Phase;
  iteration: number;
  recoveredArtifacts: string[];
  cleanedWorktreesCount: number;
  commitGraph?: VerifiedCommitGraph;
  reconciliationSummary: string;
}

const PHASE_SEQUENCE: Phase[] = [
  Phase.Inspect,
  Phase.Triage,
  Phase.Research,
  Phase.Diagnose,
  Phase.DiversityGate,
  Phase.Falsify,
  Phase.Implement,
  Phase.Verify,
  Phase.Compare,
  Phase.Review,
  Phase.Integrate,
  Phase.Publish,
  Phase.Learn,
  Phase.Finished,
];

/**
 * Execution Reconciliation Engine:
 * Implements "Retry + Reconciliation + Idempotency" rather than rigid distributed 2PC.
 * On crash recovery or restart, reconciles journal checkpoints, purges orphaned worktrees,
 * restores durable artifacts, and calculates the exact idempotent resume point.
 */
export async function reconcileRun(options: {
  runId: string;
  journal: ExecutionJournal;
  worktreeManager: WorktreeManager;
  memoryManager: DurableMemoryManager;
}): Promise<ReconciledRunState> {
  const { runId, journal, worktreeManager, memoryManager } = options;

  // 1. Load durable journal log
  const entries = await journal.getEntries(runId);
  if (entries.length === 0) {
    return {
      runId,
      resumable: false,
      nextPhase: Phase.Inspect,
      iteration: 1,
      recoveredArtifacts: [],
      cleanedWorktreesCount: 0,
      reconciliationSummary: `No journal entries found for run '${runId}'. Fresh start required.`,
    };
  }

  // 2. Identify last successfully completed phase checkpoint
  let lastCompletedEntry: JournalEntry | null = null;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].status === "COMPLETED") {
      lastCompletedEntry = entries[i];
      break;
    }
  }

  // 3. Idempotently clean all transient worktrees left behind by crash
  let cleanedWorktreesCount = 0;
  try {
    const wts = await worktreeManager.listWorktrees();
    cleanedWorktreesCount = wts.filter((w) => w.path.startsWith(worktreeManager.worktreesDir)).length;
    await worktreeManager.cleanAllWorktrees();
  } catch (err) {
    console.warn("[Reconciliation] Notice while cleaning transient worktrees:", err);
  }

  // 4. Recover durable artifacts from run directory
  const recoveredArtifacts: string[] = [];
  const artifactNames = [
    "objective.json",
    "research.json",
    "diagnosis.json",
    "falsification.json",
    "implementations.json",
    "results.json",
    "pareto-ranking.json",
    "review.json",
    "verified-memory.json",
  ];

  for (const name of artifactNames) {
    const art = await memoryManager.getArtifact(runId, name);
    if (art) {
      recoveredArtifacts.push(name);
    }
  }

  // 5. Determine next phase to resume execution
  const lastPhaseStr = lastCompletedEntry?.phaseId;
  const iteration = lastCompletedEntry?.attempt ?? 1;
  let nextPhase: Phase | undefined;

  if (lastPhaseStr) {
    const idx = PHASE_SEQUENCE.findIndex((p) => p.toLowerCase() === lastPhaseStr.toLowerCase());
    if (idx >= 0 && idx < PHASE_SEQUENCE.length - 1) {
      nextPhase = PHASE_SEQUENCE[idx + 1];
    } else if (lastPhaseStr.toLowerCase() === "finished") {
      nextPhase = Phase.Finished;
    }
  } else {
    nextPhase = Phase.Inspect;
  }

  // Extract commitGraph if recorded in verified-memory or journal details
  let commitGraph: VerifiedCommitGraph | undefined;
  if (lastCompletedEntry?.details?.commitGraph) {
    commitGraph = lastCompletedEntry.details.commitGraph as VerifiedCommitGraph;
  }

  const summary = lastCompletedEntry
    ? `Reconciliation complete: Resuming run '${runId}' at [Phase: ${nextPhase}] (Last completed: ${lastCompletedEntry.phaseId}, Iteration: ${iteration}, Recovered artifacts: ${recoveredArtifacts.length}, Cleaned worktrees: ${cleanedWorktreesCount})`
    : `Reconciliation complete: No completed phases in run '${runId}'. Restarting at [Phase: Inspect].`;

  console.log(`[Reconciliation] ${summary}`);

  return {
    runId,
    resumable: Boolean(lastCompletedEntry && nextPhase !== Phase.Finished),
    lastCompletedPhase: lastCompletedEntry?.phaseId,
    nextPhase,
    iteration,
    recoveredArtifacts,
    cleanedWorktreesCount,
    commitGraph,
    reconciliationSummary: summary,
  };
}

/**
 * Applies a reconciled state to an active HarnessContext, restoring recovered artifacts
 * into blackboard memory to seamlessly resume exploration without duplication.
 */
export async function applyReconciledStateToContext(
  reconciled: ReconciledRunState,
  ctx: HarnessContext
): Promise<void> {
  if (!reconciled.resumable || !reconciled.nextPhase) return;

  ctx.phase = reconciled.nextPhase;
  ctx.iteration = reconciled.iteration;
  if (reconciled.commitGraph) {
    ctx.commitGraph = reconciled.commitGraph;
    ctx.verifiedCommitSha = reconciled.commitGraph.verifiedHeadSha;
  }

  // Restore recovered artifacts into blackboard
  for (const artName of reconciled.recoveredArtifacts) {
    const data = await ctx.memoryManager.getArtifact(reconciled.runId, artName);
    if (!data) continue;

    switch (artName) {
      case "research.json":
        ctx.research = data;
        break;
      case "diagnosis.json":
        ctx.diagnosis = data;
        break;
      case "falsification.json":
        ctx.falsifiedCandidates = data.survivors ?? data;
        ctx.falsificationReviews = data.reviews;
        break;
      case "implementations.json":
        ctx.implementations = data;
        break;
      case "results.json":
        ctx.verifications = data.candidates ?? [];
        ctx.baselineVerification = data.baseline;
        break;
      case "review.json":
        ctx.review = data;
        break;
      case "verified-memory.json":
        ctx.verifiedMemory = data;
        break;
    }
  }

  ctx.evidenceStore?.addObservation({
    source: "reconciliation:crash_recovery",
    content: `Resumed run '${reconciled.runId}' after crash. Restored ${reconciled.recoveredArtifacts.length} artifacts into blackboard. Next phase: ${reconciled.nextPhase}`,
    iteration: ctx.iteration,
    data: { reconciled },
  });
}
