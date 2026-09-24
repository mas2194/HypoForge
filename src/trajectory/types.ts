export interface CandidateTrajectoryRecord {
  candidateId: string;
  level: string | number;
  hypothesis: string;
  branchName: string;
  passedVerification: boolean;
  verificationScore: number;
  rejectionReason?: string;
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

