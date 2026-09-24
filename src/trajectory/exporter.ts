import fs from "node:fs/promises";
import path from "node:path";
import type {
  RunTrajectory,
  PreferencePair,
  CandidateTrajectoryRecord,
  TrajectoryProvenance,
  CandidateDisposition,
} from "./types.js";
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
  isHardNegative?: boolean;
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

  if (params.isHardNegative) {
    weight += 0.10;
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
      const rejectionRecord = ctx.rejectedCandidates?.find(
        (r) => r.candidate.implementation.candidateId === impl.candidateId
      );

      let disposition: CandidateDisposition;
      let rejectionReason: string | undefined;
      let failureClass: string | undefined;

      const passedHardGates = ver?.hardGates
        ? ver.hardGates.passedAll
        : ver?.tests
        ? ver.tests.failed === 0
        : false;

      if (isWinner) {
        disposition = "WINNER";
      } else if (rejectionRecord) {
        // Clean-room audit specifically rejected this candidate with blocking issues
        rejectionReason = `Clean-room audit rejected: ${rejectionRecord.blockingIssues.join("; ")}`;
        failureClass = ctx.review?.failureClass;
        disposition = rejectionRecord.blockingIssues.some((b) => /regression|broken/i.test(b))
          ? "REJECTED_REGRESSION"
          : "REJECTED_INVALID";
      } else if (ver && (!passedHardGates || ver.tests.failed > 0)) {
        if (ver.regressions?.length > 0 || (ver.tests.failingTestIds && ver.tests.failingTestIds.length > 0)) {
          disposition = "REJECTED_REGRESSION";
          rejectionReason = `Regressions detected: ${ver.regressions?.join("; ") || `${ver.tests.failed} test(s) failed`}`;
        } else {
          disposition = "REJECTED_INVALID";
          rejectionReason = `Hard gates failed: ${ver.hardGates?.failureReasons?.join("; ") || "tests failed"}`;
        }
      } else if (ver && passedHardGates) {
        // Passed hard gates, not rejected by audit
        const isQueued = ctx.candidateQueue?.some((q) => q.implementation.candidateId === impl.candidateId);
        if (isQueued && ver.softMetrics?.evidenceStrength && ver.softMetrics.evidenceStrength >= 0.8) {
          disposition = "VALID_ALTERNATIVE";
          rejectionReason = "High-quality viable alternative (not chosen as primary winner)";
        } else if (ctx.winner && ver.score < ctx.winner.verification.score) {
          disposition = "VALID_BUT_DOMINATED";
          rejectionReason = `Lower verification score (${ver.score.toFixed(2)} vs ${ctx.winner.verification.score.toFixed(2)})`;
        } else {
          disposition = "VALID_BUT_DOMINATED";
          rejectionReason = "Passed hard gates but superseded by Pareto dominance / diff efficiency";
        }
      } else {
        disposition = "REJECTED_INVALID";
        rejectionReason = "Implementation did not produce verifiable artifacts";
      }

      return {
        candidateId: impl.candidateId,
        level: impl.level,
        hypothesis,
        branchName: impl.branchName,
        disposition,
        passedVerification: ver ? ver.tests.failed === 0 && passedHardGates : false,
        verificationScore: ver?.score ?? 0,
        evidenceStrength: ver?.softMetrics?.evidenceStrength,
        rejectionReason,
        failureClass,
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
          // CRITICAL SAFETY GUARD:
          // Do NOT generate negative DPO preference pairs for VALID_ALTERNATIVE!
          // Legitimate alternative solutions must not be penalized as false-negatives during model alignment.
          if (cand.disposition === "VALID_ALTERNATIVE") {
            continue;
          }

          const scoreDelta = winner.verification.score - cand.verificationScore;
          const tier3Passed = winner.verification.metamorphic?.passed ?? true;
          const isHardNegative = cand.disposition === "REJECTED_REGRESSION" || cand.disposition === "REJECTED_INVALID";
          const rawWeight = computeDPOConfidenceWeight({
            provenance: "machine_verified",
            tier3MetamorphicPassed: tier3Passed,
            scoreDelta,
            isHardNegative,
          });

          // Soften marginal negative weights (VALID_BUT_DOMINATED) so they don't overpower hard bugs
          const confidenceWeight = cand.disposition === "VALID_BUT_DOMINATED"
            ? Math.round(rawWeight * 0.40 * 100) / 100
            : rawWeight;

          preferencePairs.push({
            prompt: ctx.goal,
            provenance: "machine_verified",
            confidenceWeight,
            pairType: isHardNegative ? "HARD_NEGATIVE" : "MARGINAL_NEGATIVE",
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
              disposition: cand.disposition,
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
