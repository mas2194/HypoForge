import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CandidateHypothesis } from "../schemas/diagnosis.js";
import {
  CandidateImplementationSchema,
  type CandidateImplementation,
} from "../schemas/candidate.js";
import type { WorktreeManager } from "../git/worktree.js";
import type { CodexClientManager } from "../codex/client.js";
import type { HarnessEventBus } from "../server/event-bus.js";
import type { VerificationResult } from "../schemas/result.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ImplementOptions {
  candidates: CandidateHypothesis[];
  worktreeManager: WorktreeManager;
  codexManager?: CodexClientManager;
  runId?: string;
  eventBus?: HarnessEventBus;
  priorResults?: string[];
}

export interface RepairOptions {
  implementations: CandidateImplementation[];
  failures: Map<string, VerificationResult>;
  codexManager?: CodexClientManager;
  testCommand: string;
  eventBus?: HarnessEventBus;
  repairRound: number;
}

/** Ask the candidate's worker to diagnose and repair its own failing test run. */
export async function repairFailedCandidates(options: RepairOptions): Promise<void> {
  if (!options.codexManager) return;

  const repairs = options.implementations.filter((impl) => options.failures.has(impl.candidateId));
  await Promise.all(repairs.map(async (impl) => {
    const verification = options.failures.get(impl.candidateId)!;
    options.eventBus?.emitSubAgent({
      agentId: `worker-${impl.candidateId}`,
      name: `Worker [${impl.candidateId}]`,
      role: "Repair candidate after failed verification",
      phase: "Verify",
      status: "running",
      type: "start",
      message: `Repairing test failures (round ${options.repairRound})...`,
      details: { candidateId: impl.candidateId, repairRound: options.repairRound },
    });

    try {
      const thread = options.codexManager!.startWorkerThread({ workingDirectory: impl.worktreePath });
      const turn = await thread.run(`The independent harness verification failed for candidate ${impl.candidateId}.

Test command: ${options.testCommand}
Exit code: ${verification.tests.exitCode}
Failed command count: ${verification.tests.failed}
Reported failing test IDs: ${verification.tests.failingTestIds.join(", ") || "none parsed"}

Failure output:
\`\`\`text
${verification.tests.output.slice(-20000)}
\`\`\`

Inspect the implementation and the failure output, fix the underlying cause in this worktree, rerun the test command, and continue fixing errors until it passes or you can explain a blocker. Do not weaken, delete, skip, or alter tests merely to make them pass. Keep the candidate's intended behavior. Commit your repair on the current candidate branch so the harness can measure and verify it.`);
      impl.repairReports = [...(impl.repairReports ?? []), turn.finalResponse.slice(-12000)];
      options.eventBus?.emitSubAgent({
        agentId: `worker-${impl.candidateId}`,
        name: `Worker [${impl.candidateId}]`,
        role: "Repair candidate after failed verification",
        phase: "Verify",
        status: "completed",
        type: "finish",
        message: `Repair attempt ${options.repairRound} finished; candidate will be independently verified again.`,
        details: { candidateId: impl.candidateId, repairRound: options.repairRound, report: turn.finalResponse.slice(-4000) },
      });
    } catch (err: any) {
      options.eventBus?.emitSubAgent({
        agentId: `worker-${impl.candidateId}`,
        name: `Worker [${impl.candidateId}]`,
        role: "Repair candidate after failed verification",
        phase: "Verify",
        status: "failed",
        type: "finish",
        message: `Repair attempt failed: ${err?.message || err}`,
        details: { candidateId: impl.candidateId, repairRound: options.repairRound },
      });
    }
  }));
}

import { EMBEDDED_PROMPTS } from "../prompts/embedded.js";

export async function runImplementPhase(
  options: ImplementOptions
): Promise<CandidateImplementation[]> {
  const { candidates, worktreeManager, codexManager, runId = `run-${Date.now()}` } = options;

  const promptPath = path.resolve(__dirname, "../../prompts/implementer.md");
  let systemPrompt = EMBEDDED_PROMPTS.implementer;
  try {
    systemPrompt = await fs.readFile(promptPath, "utf-8");
  } catch {
    // Keep embedded prompt fallback
  }

  // 1. Prepare worktrees for each candidate
  const candidateTasks = candidates.map(async (candidate) => {
    const branchName = `agent/${runId}/${candidate.id}`;
    const dirName = `${runId}-${candidate.id}`;
    
    options.eventBus?.emitSubAgent({
      agentId: `worker-${candidate.id}`,
      name: `Worker [${candidate.id}]`,
      role: `Implement solution in isolated worktree (${candidate.level})`,
      phase: "Implement",
      status: "running",
      type: "start",
      message: `Creating worktree on branch ${branchName}...`,
      details: { candidateId: candidate.id, level: candidate.level, hypothesis: candidate.hypothesis },
    });

    const worktreePath = await worktreeManager.createWorktree(branchName, dirName);

    const impl: CandidateImplementation = CandidateImplementationSchema.parse({
      candidateId: candidate.id,
      level: candidate.level,
      worktreePath,
      branchName,
      status: "implementing",
    });

    options.eventBus?.emitSubAgent({
      agentId: `worker-${candidate.id}`,
      name: `Worker [${candidate.id}]`,
      role: `Implement solution in isolated worktree (${candidate.level})`,
      phase: "Implement",
      status: "running",
      type: "tool",
      message: `Worktree mounted at ${worktreePath}. Executing Codex agent...`,
      details: { worktreePath, branchName },
    });

    // 2. Run Codex worker thread inside the isolated worktree
    if (codexManager) {
      try {
        const thread = codexManager.startWorkerThread({
          workingDirectory: worktreePath,
        });

        const prompt = `
${systemPrompt}

${options.priorResults?.length ? `Previous failed run results (use these to avoid repeating failed approaches):\n${options.priorResults.join("\n\n--- Previous attempt ---\n\n")}` : ""}

You are implementing Candidate Solution: "${candidate.id}" (Intervention Level: ${candidate.level}).
Hypothesis: ${candidate.hypothesis}
Experiment: ${candidate.experiment}

Instructions:
- Make all necessary file modifications strictly in this worktree directory.
- Choose whether testing is useful for this change. If it is, select an appropriate method and scope from the repository's existing scripts, tests, and conventions; you do not have to run a test command when it would not add useful confidence. If a check you choose fails, inspect the output, fix the underlying issue, and rerun the relevant check. Do not weaken, delete, or skip tests merely to hide a failure.
- Report which checks you ran, their results, or why you judged testing unnecessary.
- When finished, commit your changes to this branch if possible, or leave files ready.
`.trim();

        const turn = await thread.run(prompt);
        impl.agentReport = turn.finalResponse.slice(-12000);
        impl.status = "completed";

        options.eventBus?.emitSubAgent({
          agentId: `worker-${candidate.id}`,
          name: `Worker [${candidate.id}]`,
          role: `Implement solution in isolated worktree (${candidate.level})`,
          phase: "Implement",
          status: "completed",
          type: "finish",
          message: `Implementation completed successfully for candidate ${candidate.id}`,
          details: { candidateId: candidate.id, worktreePath, report: turn.finalResponse.slice(-4000) },
        });
      } catch (err: any) {
        console.error(`Implementation failed for ${candidate.id}:`, err);
        impl.status = "failed";
        impl.error = err?.stack || err?.message || String(err);

        options.eventBus?.emitSubAgent({
          agentId: `worker-${candidate.id}`,
          name: `Worker [${candidate.id}]`,
          role: `Implement solution in isolated worktree (${candidate.level})`,
          phase: "Implement",
          status: "failed",
          type: "finish",
          message: `Implementation failed: ${err?.message || err}`,
          details: { candidateId: candidate.id, error: impl.error },
        });
      }
    } else {
      // Simulation / offline mode
      impl.status = "completed";
      options.eventBus?.emitSubAgent({
        agentId: `worker-${candidate.id}`,
        name: `Worker [${candidate.id}]`,
        role: `Implement solution in isolated worktree (${candidate.level})`,
        phase: "Implement",
        status: "completed",
        type: "finish",
        message: `Offline/Simulation mode: candidate ${candidate.id} ready for verification.`,
        details: { candidateId: candidate.id, worktreePath },
      });
    }

    return impl;
  });

  // Execute in parallel across isolated worktrees
  return Promise.all(candidateTasks);
}
