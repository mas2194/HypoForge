export type CandidateDisposition =
  | "WINNER"
  | "REJECTED_INVALID"     // Test failures, type errors, build failure (Hard Negative)
  | "REJECTED_REGRESSION"  // Broke existing tests or introduced regressions (Highest-weight Hard Negative)
  | "VALID_BUT_DOMINATED"  // Passed hard gates but dominated on Pareto/efficiency (Marginal Negative)
  | "VALID_ALTERNATIVE";   // High quality/approved alternative (Excluded from DPO negatives)

export interface CandidateTrajectoryRecord {
  candidateId: string;
  level: string | number;
  hypothesis: string;
  branchName: string;
  disposition: CandidateDisposition;
  passedVerification: boolean;
  verificationScore: number;
  evidenceStrength?: number;
  rejectionReason?: string;
  failureClass?: string;
}

export type TrajectoryProvenance =
  | "self_reviewed"
  | "machine_verified"
  | "ci_verified"
  | "human_approved"
  | "post_merge_success";

export interface PreferencePair {
  prompt: string;
  provenance: TrajectoryProvenance;
  confidenceWeight: number;
  pairType: "HARD_NEGATIVE" | "MARGINAL_NEGATIVE";
  chosen: {
    candidateId: string;
    level: string | number;
    hypothesis: string;
    score: number;
    rationale: string;
  };
  rejected: {
    candidateId: string;
    level: string | number;
    hypothesis: string;
    score: number;
    disposition: CandidateDisposition;
    rejectionReason: string;
  };
}

export interface RunTrajectory {
  runId: string;
  goal: string;
  timestamp: string;
  iteration: number;
  provenance: TrajectoryProvenance;
  researchSummary?: string;
  candidates: CandidateTrajectoryRecord[];
  winnerCandidateId?: string;
  preferencePairs: PreferencePair[];
}

