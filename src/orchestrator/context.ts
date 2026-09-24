import type { WorktreeManager } from "../git/worktree.js";
import type { Evaluator } from "../evaluator/runner.js";
import type { DurableMemoryManager } from "../memory/durable-memory.js";
import type { MemorySearchResult } from "../memory/fts-index.js";
import type { SkillManager } from "../skills/skill-manager.js";
import type { Skill } from "../skills/types.js";
import type { TrajectoryExporter } from "../trajectory/exporter.js";
import type { GitHubBroker } from "../github/broker.js";
import type { CodexClientManager } from "../codex/client.js";
import type { ResearchBrief } from "../schemas/research.js";
import type { Diagnosis, CandidateHypothesis } from "../schemas/diagnosis.js";
import type { CandidateImplementation } from "../schemas/candidate.js";
import type { VerificationResult, ReviewResult } from "../schemas/result.js";
import type { FalsifiedCandidate } from "../phases/falsify.js";
import type { NodeExecutionRecord } from "../bt/types.js";
import type { ContextCompactor, DistilledLesson, CompactionRecord } from "./compactor.js";

import type { ResearchRoutingDecision } from "../phases/research-router.js";

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

export interface QueuedCandidate {
  implementation: CandidateImplementation;
  verification: VerificationResult;
}

export interface RejectedCandidateRecord {
  candidate: QueuedCandidate;
  blockingIssues: string[];
}

import type { ParetoComparisonResult } from "../evaluator/pareto.js";
import type { DiversityEvaluation } from "../phases/diversity-gate.js";
import type { BacktrackDecision } from "./backtrack-router.js";
import type { BudgetTracker } from "../budget/tracker.js";
import type { RepoInspection, ProblemSignature } from "../phases/inspect-repo.js";
import type { VerifiedMemoryRecord } from "../memory/verified-memory.js";

export interface HarnessContext {
  // Goal & Execution Identity
  goal: string;
  runId: string;
  repoRoot: string;
  testCommand?: string;
  publishPr: boolean;
  phase: Phase;
  finished: boolean;
  unresolved?: boolean;
  unresolvedReason?: string;
  error?: string;

  // Infrastructure managers
  worktreeManager: WorktreeManager;
  evaluator: Evaluator;
  memoryManager: DurableMemoryManager;
  skillManager: SkillManager;
  trajectoryExporter: TrajectoryExporter;
  githubBroker: GitHubBroker;
  codexManager?: CodexClientManager;
  compactor: ContextCompactor;
  budgetTracker: BudgetTracker;

  // Hermes-style Dynamic Memories & Skills
  repoInspection?: RepoInspection;
  problemSignature?: ProblemSignature;
  recalledMemories: MemorySearchResult[];
  activeSkills: Skill[];
  crystallizedSkill?: Skill;
  exportedTrajectoryPath?: string;

  // Artifacts produced along the ladder
  researchRouting?: ResearchRoutingDecision;
  research?: ResearchBrief;
  diagnosis?: Diagnosis;
  diversityEvaluation?: DiversityEvaluation;
  falsifiedCandidates?: CandidateHypothesis[];
  falsificationReviews?: FalsifiedCandidate[];
  implementations: CandidateImplementation[];
  verifications: VerificationResult[];
  baselineVerification?: VerificationResult;
  paretoComparison?: ParetoComparisonResult;
  candidateQueue: QueuedCandidate[];
  rejectedCandidates: RejectedCandidateRecord[];
  winner?: QueuedCandidate;
  review?: ReviewResult;
  publishedPrUrl?: string;
  adrFilename?: string;
  verifiedMemory?: VerifiedMemoryRecord;

  // Self-Healing Feedback and Observability
  iteration: number;
  backtrackDecision?: BacktrackDecision;
  rejectionFeedbacks: string[];
  distilledLessons: DistilledLesson[];
  compactionRecords: CompactionRecord[];
  traceLog: NodeExecutionRecord[];
}
