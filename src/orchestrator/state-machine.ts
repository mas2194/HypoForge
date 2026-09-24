import { WorktreeManager } from "../git/worktree.js";
import { Evaluator } from "../evaluator/runner.js";
import { CodexClientManager } from "../codex/client.js";
import { DurableMemoryManager } from "../memory/durable-memory.js";
import { GitHubBroker } from "../github/broker.js";
import { runArchitectPhase } from "../phases/architect.js";
import { runFalsifyPhase, type FalsifiedCandidate } from "../phases/falsify.js";
import { runImplementPhase } from "../phases/implement.js";
import { runCleanRoomReviewPhase } from "../phases/review.js";
import type { Diagnosis, CandidateHypothesis } from "../schemas/diagnosis.js";
import type { CandidateImplementation } from "../schemas/candidate.js";
import type { VerificationResult, ReviewResult } from "../schemas/result.js";

export enum Phase {
  Inspect = "Inspect",
  Diagnose = "Diagnose",
  Falsify = "Falsify",
  Implement = "Implement",
  Verify = "Verify",
  Compare = "Compare",
  Review = "Review",
  Integrate = "Integrate",
  Publish = "Publish",
  Learn = "Learn",
  Finished = "Finished",
}

export interface OrchestratorState {
  phase: Phase;
  goal: string;
  runId: string;
  diagnosis?: Diagnosis;
  falsifiedCandidates?: CandidateHypothesis[];
  falsificationReviews?: FalsifiedCandidate[];
  implementations: CandidateImplementation[];
  verifications: VerificationResult[];
  winner?: {
    implementation: CandidateImplementation;
    verification: VerificationResult;
  };
  review?: ReviewResult;
  publishedPrUrl?: string;
  adrFilename?: string;
  finished: boolean;
  error?: string;
}

export interface OrchestratorOptions {
  goal: string;
  repoRoot?: string;
  testCommand?: string;
  useCodex?: boolean;
  publishPr?: boolean;
}

export class HarnessStateMachine {
  state: OrchestratorState;
  private worktreeManager: WorktreeManager;
  private evaluator: Evaluator;
  private memoryManager: DurableMemoryManager;
  private githubBroker: GitHubBroker;
  private codexManager?: CodexClientManager;
  private testCommand?: string;
  private publishPr: boolean;

  constructor(options: OrchestratorOptions) {
    const runId = `run-${Date.now()}`;
    this.state = {
      phase: Phase.Inspect,
      goal: options.goal,
      runId,
      implementations: [],
      verifications: [],
      finished: false,
    };

    this.worktreeManager = new WorktreeManager({ repoRoot: options.repoRoot });
    this.evaluator = new Evaluator();
    this.memoryManager = new DurableMemoryManager({ repoRoot: options.repoRoot });
    this.githubBroker = new GitHubBroker();
    this.testCommand = options.testCommand;
    this.publishPr = options.publishPr ?? false;

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
      case Phase.Inspect: {
        console.log(`[Phase: Inspect] Initializing run ${this.state.runId} for goal: "${this.state.goal}"`);
        await this.memoryManager.initRun(this.state.runId, {
          goal: this.state.goal,
          timestamp: new Date().toISOString(),
          repoRoot: this.worktreeManager.repoRoot,
        });
        this.state.phase = Phase.Diagnose;
        break;
      }

      case Phase.Diagnose: {
        console.log(`[Phase: Diagnose] Analyzing goal across Intervention Ladder...`);
        this.state.diagnosis = await runArchitectPhase(
          { goal: this.state.goal, repoPath: this.worktreeManager.repoRoot },
          this.codexManager
        );
        await this.memoryManager.saveArtifact(this.state.runId, "diagnosis.json", this.state.diagnosis);
        console.log(`[Phase: Diagnose] Generated ${this.state.diagnosis.candidates.length} candidates.`);
        this.state.phase = Phase.Falsify;
        break;
      }

      case Phase.Falsify: {
        if (!this.state.diagnosis) throw new Error("Diagnosis missing for falsification");
        console.log(`[Phase: Falsify] Subjecting candidates to rigorous counter-argument scrutiny...`);
        const { candidates, reviews } = await runFalsifyPhase(
          {
            candidates: this.state.diagnosis.candidates,
            goal: this.state.goal,
            repoPath: this.worktreeManager.repoRoot,
          },
          this.codexManager
        );
        this.state.falsifiedCandidates = candidates.filter((c) => c.worthExperimenting);
        this.state.falsificationReviews = reviews;

        await this.memoryManager.saveArtifact(this.state.runId, "falsification.json", {
          reviews,
          survivors: this.state.falsifiedCandidates,
        });

        console.log(`[Phase: Falsify] ${this.state.falsifiedCandidates.length} candidate(s) survived for parallel worktree implementation.`);
        this.state.phase = Phase.Implement;
        break;
      }

      case Phase.Implement: {
        const candidates = this.state.falsifiedCandidates ?? this.state.diagnosis?.candidates ?? [];
        console.log(`[Phase: Implement] Spawning parallel worktrees for ${candidates.length} candidate(s)...`);
        this.state.implementations = await runImplementPhase({
          candidates,
          worktreeManager: this.worktreeManager,
          codexManager: this.codexManager,
          runId: this.state.runId,
        });

        await this.memoryManager.saveArtifact(this.state.runId, "implementations.json", this.state.implementations);
        console.log(`[Phase: Implement] Finished implementations in isolated worktrees.`);
        this.state.phase = Phase.Verify;
        break;
      }

      case Phase.Verify: {
        console.log(`[Phase: Verify] Independently evaluating each worktree candidate with objective test suites...`);
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
          console.log(`  - Candidate ${impl.candidateId} (${impl.level}): score=${result.score.toFixed(2)}, passed=${result.tests.passed}, failed=${result.tests.failed}`);
        }

        await this.memoryManager.saveArtifact(this.state.runId, "results.json", this.state.verifications);
        this.state.phase = Phase.Compare;
        break;
      }

      case Phase.Compare: {
        console.log(`[Phase: Compare] Ranking candidates based on objective evidence (score & ladder level)...`);
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
          console.log(`[Phase: Compare] Winner candidate selected: ${bestWinner.implementation.candidateId} (score: ${bestWinner.verification.score.toFixed(2)})`);
          this.state.phase = Phase.Review;
        } else {
          console.log(`[Phase: Compare] No candidate passed verification without errors.`);
          this.state.phase = Phase.Finished;
          this.state.finished = true;
        }
        break;
      }

      case Phase.Review: {
        if (!this.state.winner) throw new Error("No winner to review");
        console.log(`[Phase: Review] Launching clean-room audit without conversational context...`);
        this.state.review = await runCleanRoomReviewPhase(
          {
            goal: this.state.goal,
            implementation: this.state.winner.implementation,
            verification: this.state.winner.verification,
            repoPath: this.worktreeManager.repoRoot,
          },
          this.codexManager
        );

        await this.memoryManager.saveArtifact(this.state.runId, "review.json", this.state.review);

        if (this.state.review.approved) {
          console.log(`[Phase: Review] Clean-room audit APPROVED the changes.`);
          this.state.phase = Phase.Integrate;
        } else {
          console.warn(`[Phase: Review] Clean-room audit REJECTED changes:`, this.state.review.blockingIssues);
          this.state.phase = Phase.Finished;
          this.state.finished = true;
        }
        break;
      }

      case Phase.Integrate: {
        if (!this.state.winner) throw new Error("No winner to integrate");
        console.log(`[Phase: Integrate] Merging winning branch '${this.state.winner.implementation.branchName}'...`);
        const mergeResult = await this.worktreeManager.mergeBranch(
          this.state.winner.implementation.branchName
        );
        if (!mergeResult.success) {
          console.warn(`[Phase: Integrate] Merge warning: ${mergeResult.error}`);
        } else {
          console.log(`[Phase: Integrate] Successfully integrated winner into active codebase.`);
        }

        console.log(`[Phase: Integrate] Cleaning up worktrees...`);
        await this.worktreeManager.cleanAllWorktrees();

        this.state.phase = this.publishPr ? Phase.Publish : Phase.Learn;
        break;
      }

      case Phase.Publish: {
        if (this.state.winner) {
          console.log(`[Phase: Publish] Requesting GitHub Broker to handle Pull Request creation...`);
          const pr = await this.githubBroker.createPullRequest({
            title: `[Autonomous Agent] ${this.state.goal}`,
            head: this.state.winner.implementation.branchName,
            base: "main",
            body: `## Summary\nAutonomous exploration resolved goal: "${this.state.goal}".\n- Candidate Level: ${this.state.winner.implementation.level}\n- Verification Score: ${this.state.winner.verification.score.toFixed(2)}`,
          });
          this.state.publishedPrUrl = pr.url;
        }
        this.state.phase = Phase.Learn;
        break;
      }

      case Phase.Learn: {
        if (this.state.winner) {
          console.log(`[Phase: Learn] Recording Architecture Decision Record (ADR) in repository...`);
          const adrFile = await this.memoryManager.recordDecisionRecord(
            this.state.goal,
            `Goal required solving: ${this.state.goal}. Investigated alternatives via parallel worktrees across the Intervention Ladder.`,
            `Selected candidate "${this.state.winner.implementation.candidateId}" (Level: ${this.state.winner.implementation.level}) based on objective verification score: ${this.state.winner.verification.score.toFixed(2)}.`,
            `Clean-room review verified no architecture regressions.`
          );
          this.state.adrFilename = adrFile;
          console.log(`[Phase: Learn] Recorded ADR: ${adrFile}`);
        }

        await this.memoryManager.saveArtifact(this.state.runId, "final.json", {
          runId: this.state.runId,
          goal: this.state.goal,
          winner: this.state.winner,
          review: this.state.review,
          adr: this.state.adrFilename,
          finishedAt: new Date().toISOString(),
        });

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
