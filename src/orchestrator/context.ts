import type { WorktreeManager } from "../git/worktree.js";
import type { Evaluator } from "../evaluator/runner.js";
import type { DurableMemoryManager } from "../memory/durable-memory.js";
import type { GitHubBroker } from "../github/broker.js";
import type { CodexClientManager } from "../codex/client.js";
import type { ResearchBrief } from "../schemas/research.js";
import type { Diagnosis, CandidateHypothesis } from "../schemas/diagnosis.js";
import type { CandidateImplementation } from "../schemas/candidate.js";
import type { VerificationResult, ReviewResult } from "../schemas/result.js";
import type { FalsifiedCandidate } from "../phases/falsify.js";
import type { NodeExecutionRecord } from "../bt/types.js";

export enum Phase {
  Inspect = "Inspect",
  Research = "Research",
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

export interface HarnessContext {
  // Goal & Execution Identity
  goal: string;
  runId: string;
  repoRoot: string;
  testCommand?: string;
  publishPr: boolean;
  phase: Phase;
  finished: boolean;
  error?: string;

  // Infrastructure managers
  worktreeManager: WorktreeManager;
  evaluator: Evaluator;
  memoryManager: DurableMemoryManager;
  githubBroker: GitHubBroker;
  codexManager?: CodexClientManager;

  // Artifacts produced along the ladder
  research?: ResearchBrief;
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

  // Self-Healing Feedback and Observability
  iteration: number;
  rejectionFeedbacks: string[];
  traceLog: NodeExecutionRecord[];
}
