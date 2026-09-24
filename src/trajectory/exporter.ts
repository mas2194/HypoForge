import fs from "node:fs/promises";
import path from "node:path";
import type { RunTrajectory, PreferencePair, CandidateTrajectoryRecord, TrajectoryProvenance } from "./types.js";
import type { HarnessContext } from "../orchestrator/context.js";

/**
 * Computes calibrated DPO confidence weight based on empirical evidence strength.
 * Avoids model echo-chamber / self-reinforcement collapse by strictly weighting evidence.
 */
export function computeDPOConfidenceWeight(params: {
  provenance: TrajectoryProvenance;
  tier3MetamorphicPassed?: boolean;
  scoreDelta?: number;
  stableDays?: number;
}): number {
  const baseMap: Record<TrajectoryProvenance, number> = {
    self_reviewed: 0.15,
    machine_verified: 0.35,
    ci_verified: 0.65,
    human_approved: 0.85,
    post_merge_success: 1.0,
  };

  let weight = baseMap[params.provenance] ?? 0.35;

  if (params.tier3MetamorphicPassed) {
    weight += 0.10;
  }

  if (params.scoreDelta && params.scoreDelta > 30) {
    weight += 0.05;
  }

  if (params.stableDays && params.stableDays >= 7) {
    weight += 0.10;
  }

  return Math.min(Math.max(weight, 0.05), 1.0);
}

export class TrajectoryExporter {
  readonly repoRoot: string;
  readonly trajectoryDir: string;

  constructor(repoRoot: string = process.cwd()) {
    this.repoRoot = path.resolve(repoRoot);
    this.trajectoryDir = path.resolve(this.repoRoot, ".agent", "trajectories");
  }

  buildTrajectory(ctx: HarnessContext): RunTrajectory {
    const candidates: CandidateTrajectoryRecord[] = ctx.implementations.map((impl) => {
      const ver = ctx.verifications.find((v) => v.candidateId === impl.candidateId);
      const isWinner = ctx.winner?.implementation.candidateId === impl.candidateId;
      const diagCand = ctx.diagnosis?.candidates.find((c) => c.id === impl.candidateId);
      const hypothesis = diagCand?.hypothesis ?? "No hypothesis recorded";
      let rejectionReason: string | undefined;

      if (!isWinner) {
        if (ver && ver.tests.failed > 0) {
          rejectionReason = `Tests failed: ${ver.tests.failed} test(s) failed`;
        } else if (ver && ctx.winner && ver.score < ctx.winner.verification.score) {
          rejectionReason = `Lower verification score (${ver.score.toFixed(2)} vs ${ctx.winner.verification.score.toFixed(2)})`;
        } else {
          rejectionReason = "Superseded by superior candidate during clean-room review";
        }
      }

      return {
        candidateId: impl.candidateId,
        level: impl.level,
        hypothesis,
        branchName: impl.branchName,
        passedVerification: ver ? ver.tests.failed === 0 : false,
        verificationScore: ver?.score ?? 0,
        rejectionReason,
      };
    });

    const preferencePairs: PreferencePair[] = [];
    if (ctx.winner) {
      const winner = ctx.winner;
      const winnerDiag = ctx.diagnosis?.candidates.find(
        (c) => c.id === winner.implementation.candidateId
      );
      const winnerHypothesis = winnerDiag?.hypothesis ?? "Winning architecture hypothesis";

      for (const cand of candidates) {
        if (cand.candidateId !== winner.implementation.candidateId) {
          const scoreDelta = winner.verification.score - cand.verificationScore;
          const tier3Passed = winner.verification.metamorphic?.passed ?? true;
          const confidenceWeight = computeDPOConfidenceWeight({
            provenance: "machine_verified",
            tier3MetamorphicPassed: tier3Passed,
            scoreDelta,
          });

          preferencePairs.push({
            prompt: ctx.goal,
            provenance: "machine_verified",
            confidenceWeight,
            chosen: {
              candidateId: winner.implementation.candidateId,
              level: winner.implementation.level,
              hypothesis: winnerHypothesis,
              score: winner.verification.score,
              rationale: `Accepted by clean-room review with score ${winner.verification.score.toFixed(2)}.`,
            },
            rejected: {
              candidateId: cand.candidateId,
              level: cand.level,
              hypothesis: cand.hypothesis,
              score: cand.verificationScore,
              rejectionReason: cand.rejectionReason ?? "Candidate rejected by evidence comparison",
            },
          });
        }
      }
    }

    const researchSummary = ctx.research
      ? `Classification: ${ctx.research.problemClassification}. SOTA: ${ctx.research.sotaApproaches.map((s) => s.technique).join(", ")}`
      : undefined;

    return {
      runId: ctx.runId,
      goal: ctx.goal,
      timestamp: new Date().toISOString(),
      iteration: ctx.iteration,
      provenance: "machine_verified",
      researchSummary,
      candidates,
      winnerCandidateId: ctx.winner?.implementation.candidateId,
      preferencePairs,
    };
  }

  async exportRunTrajectory(ctx: HarnessContext): Promise<string> {
    await fs.mkdir(this.trajectoryDir, { recursive: true });
    const trajectory = this.buildTrajectory(ctx);
    const filePath = path.resolve(this.trajectoryDir, `${ctx.runId}.json`);

    await fs.writeFile(filePath, JSON.stringify(trajectory, null, 2), "utf-8");
    return filePath;
  }
}
