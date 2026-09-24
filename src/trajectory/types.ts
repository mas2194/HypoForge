export interface CandidateTrajectoryRecord {
  candidateId: string;
  level: string | number;
  hypothesis: string;
  branchName: string;
  passedVerification: boolean;
  verificationScore: number;
  rejectionReason?: string;
}

export interface PreferencePair {
  prompt: string;
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
  researchSummary?: string;
  candidates: CandidateTrajectoryRecord[];
  winnerCandidateId?: string;
  preferencePairs: PreferencePair[];
}
