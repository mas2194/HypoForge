import { WorktreeManager } from "../git/worktree.js";
import { Evaluator } from "../evaluator/runner.js";
import { CodexClientManager } from "../codex/client.js";
import { runArchitectPhase } from "../phases/architect.js";
import { runImplementPhase } from "../phases/implement.js";
import type { Diagnosis } from "../schemas/diagnosis.js";
import type { CandidateImplementation } from "../schemas/candidate.js";
import type { VerificationResult } from "../schemas/result.js";

export enum Phase {
  Diagnose = "Diagnose",
  Implement = "Implement",
  Verify = "Verify",
  Compare = "Compare",
  Integrate = "Integrate",
  Finished = "Finished",
}

export interface OrchestratorState {
  phase: Phase;
  goal: string;
  runId: string;
  diagnosis?: Diagnosis;
  implementations: CandidateImplementation[];
  verifications: VerificationResult[];
  winner?: {
    implementation: CandidateImplementation;
    verification: VerificationResult;
  };
  finished: boolean;
  error?: string;
}

export interface OrchestratorOptions {
  goal: string;
  repoRoot?: string;
  testCommand?: string;
  useCodex?: boolean;
}

export class HarnessStateMachine {
  state: OrchestratorState;
  private worktreeManager: WorktreeManager;
  private evaluator: Evaluator;
  private codexManager?: CodexClientManager;
  private testCommand?: string;

  constructor(options: OrchestratorOptions) {
    const runId = `run-${Date.now()}`;
    this.state = {
      phase: Phase.Diagnose,
      goal: options.goal,
      runId,
      implementations: [],
      verifications: [],
      finished: false,
    };

    this.worktreeManager = new WorktreeManager({ repoRoot: options.repoRoot });
    this.evaluator = new Evaluator();
    this.testCommand = options.testCommand;

    if (options.useCodex) {
      try {
        this.codexManager = new CodexClientManager();
      } catch (err) {
        console.warn("Could not initialize CodexClientManager:", err);
      }
    }
  }

  async step(): Promise<OrchestratorState> {
    switch (this.state.phase) {
      case Phase.Diagnose: {
        console.log(`[Phase: Diagnose] Analyzing goal: "${this.state.goal}"...`);
        this.state.diagnosis = await runArchitectPhase(
          { goal: this.state.goal, repoPath: this.worktreeManager.repoRoot },
          this.codexManager
        );
        console.log(`[Phase: Diagnose] Generated ${this.state.diagnosis.candidates.length} candidates across Intervention Ladder.`);
        this.state.phase = Phase.Implement;
        break;
      }

      case Phase.Implement: {
        if (!this.state.diagnosis) {
          throw new Error("No diagnosis available for implementation");
        }
        console.log(`[Phase: Implement] Spawning parallel worktrees for candidates...`);
        this.state.implementations = await runImplementPhase({
          candidates: this.state.diagnosis.candidates,
          worktreeManager: this.worktreeManager,
          codexManager: this.codexManager,
          runId: this.state.runId,
        });
        console.log(`[Phase: Implement] Finished implementations in ${this.state.implementations.length} worktrees.`);
        this.state.phase = Phase.Verify;
        break;
      }

      case Phase.Verify: {
        console.log(`[Phase: Verify] Independently evaluating each worktree candidate...`);
        this.state.verifications = [];
        for (const impl of this.state.implementations) {
          const levelMultiplier = impl.level === "redesign" ? 3 : impl.level === "subsystem" ? 2 : 1;
          const result = await this.evaluator.runVerification({
            candidateId: impl.candidateId,
            worktreePath: impl.worktreePath,
            testCommand: this.testCommand,
            interventionLevel: levelMultiplier,
          });
          this.state.verifications.push(result);
          console.log(`  - Candidate ${impl.candidateId} (level: ${impl.level}): score=${result.score}, passed=${result.tests.passed}`);
        }
        this.state.phase = Phase.Compare;
        break;
      }

      case Phase.Compare: {
        console.log(`[Phase: Compare] Ranking candidates based on objective evidence...`);
        let bestScore = -Infinity;
        let bestWinner: { implementation: CandidateImplementation; verification: VerificationResult } | undefined;

        for (const verification of this.state.verifications) {
          const impl = this.state.implementations.find(
            (i) => i.candidateId === verification.candidateId
          );
          if (impl && verification.score > bestScore) {
            bestScore = verification.score;
            bestWinner = { implementation: impl, verification };
          }
        }

        if (bestWinner && bestWinner.verification.tests.failed === 0) {
          this.state.winner = bestWinner;
          console.log(`[Phase: Compare] Winner selected: ${bestWinner.implementation.candidateId} with score ${bestWinner.verification.score}`);
          this.state.phase = Phase.Integrate;
        } else {
          console.log(`[Phase: Compare] No candidate passed verification without errors.`);
          this.state.phase = Phase.Finished;
          this.state.finished = true;
        }
        break;
      }

      case Phase.Integrate: {
        if (!this.state.winner) {
          throw new Error("No winner to integrate");
        }
        console.log(`[Phase: Integrate] Merging winning branch '${this.state.winner.implementation.branchName}'...`);
        const mergeResult = await this.worktreeManager.mergeBranch(
          this.state.winner.implementation.branchName
        );
        if (!mergeResult.success) {
          console.warn(`[Phase: Integrate] Merge warning: ${mergeResult.error}`);
        } else {
          console.log(`[Phase: Integrate] Successfully integrated winner!`);
        }

        console.log(`[Phase: Integrate] Cleaning up worktrees...`);
        await this.worktreeManager.cleanAllWorktrees();

        this.state.phase = Phase.Finished;
        this.state.finished = true;
        break;
      }

      case Phase.Finished: {
        this.state.finished = true;
        break;
      }
    }

    return this.state;
  }

  async runUntilFinished(): Promise<OrchestratorState> {
    while (!this.state.finished) {
      await this.step();
    }
    return this.state;
  }
}
