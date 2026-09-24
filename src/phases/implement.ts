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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ImplementOptions {
  candidates: CandidateHypothesis[];
  worktreeManager: WorktreeManager;
  codexManager?: CodexClientManager;
  runId?: string;
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
    systemPrompt = "You are the Worker / Implementer agent operating within an isolated Git worktree.";
  }

  // 1. Prepare worktrees for each candidate
  const candidateTasks = candidates.map(async (candidate) => {
    const branchName = `agent/${runId}/${candidate.id}`;
    const dirName = `${runId}-${candidate.id}`;
    const worktreePath = await worktreeManager.createWorktree(branchName, dirName);

    const impl: CandidateImplementation = CandidateImplementationSchema.parse({
      candidateId: candidate.id,
      level: candidate.level,
      worktreePath,
      branchName,
      status: "implementing",
    });

    // 2. Run Codex worker thread inside the isolated worktree
    if (codexManager) {
      try {
        const thread = codexManager.startWorkerThread({
          workingDirectory: worktreePath,
        });

        const prompt = `
${systemPrompt}

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
      } catch (err) {
        console.error(`Implementation failed for ${candidate.id}:`, err);
        impl.status = "failed";
      }
    } else {
      // Simulation / offline mode
      impl.status = "completed";
    }

    return impl;
  });

  // Execute in parallel across isolated worktrees
  return Promise.all(candidateTasks);
}
