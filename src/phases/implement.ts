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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ImplementOptions {
  candidates: CandidateHypothesis[];
  worktreeManager: WorktreeManager;
  codexManager?: CodexClientManager;
  runId?: string;
  eventBus?: HarnessEventBus;
  priorResults?: string[];
}

export async function runImplementPhase(
  options: ImplementOptions
): Promise<CandidateImplementation[]> {
  const { candidates, worktreeManager, codexManager, runId = `run-${Date.now()}` } = options;

  const promptPath = path.resolve(__dirname, "../../prompts/implementer.md");
  let systemPrompt = "";
  try {
    systemPrompt = await fs.readFile(promptPath, "utf-8");
  } catch {
    systemPrompt = "You are the coding agent for one candidate. Work only in the assigned worktree, follow repository instructions, implement the supported hypothesis, run relevant checks, and commit the completed branch for harness evaluation.";
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
- Ensure changes compile and pass tests.
- When finished, commit your changes to this branch if possible, or leave files ready.
`.trim();

        await thread.run(prompt);
        impl.status = "completed";

        options.eventBus?.emitSubAgent({
          agentId: `worker-${candidate.id}`,
          name: `Worker [${candidate.id}]`,
          role: `Implement solution in isolated worktree (${candidate.level})`,
          phase: "Implement",
          status: "completed",
          type: "finish",
          message: `Implementation completed successfully for candidate ${candidate.id}`,
          details: { candidateId: candidate.id, worktreePath },
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
