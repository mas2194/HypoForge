import type { CandidateHypothesis } from "../schemas/diagnosis.js";

export interface ScheduledHypothesisProfile {
  hypothesisId: string;
  candidate: CandidateHypothesis;
  priorConfidence: number;
  estimatedCostSec: number;
  informationGain: number;
  efficiencyScore: number;
  posteriorConfidence?: number;
  status: "QUEUED" | "RUNNING" | "SURVIVED" | "FALSIFIED";
}

export interface SchedulingPolicyOptions {
  costWeight?: number;
  explorationTemperature?: number;
}

/**
 * Computes binary Shannon entropy H(p) in bits.
 * Maximum uncertainty at p = 0.5 (1 bit), zero uncertainty at p=0 or p=1.
 */
export function computeBinaryEntropy(p: number): number {
  if (p <= 0 || p >= 1) return 0;
  return -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
}

/**
 * Estimates baseline experiment verification cost (seconds) based on intervention level.
 * Higher intervention (e.g. subsystem refactor, redesign) incurs higher build & testing overhead.
 */
export function estimateHypothesisCost(candidate: CandidateHypothesis): number {
  switch (candidate.level) {
    case "L0_configuration_typo":
      return 3;
    case "L1_function_implementation":
    case "local":
      return 5;
    case "L2_module_responsibility":
      return 12;
    case "L3_interface_api":
    case "subsystem":
      return 25;
    case "L4_state_data_model":
      return 40;
    case "L5_concurrency_execution":
      return 60;
    case "L6_architecture":
    case "redesign":
      return 90;
    case "L7_requirement_assumption":
      return 120;
    default:
      return 30;
  }
}

/**
 * Adaptive Hypothesis Scheduler:
 * Implements Bayesian information-theoretic scheduling: Expected Information Gain per Cost (E[IG] / Cost).
 * Deprecates naive "generate 3 candidates and evaluate all equally in parallel" in favor of
 * prioritized execution where cheap, high-information falsification experiments are executed first.
 */
export class AdaptiveHypothesisScheduler {
  private profiles: Map<string, ScheduledHypothesisProfile> = new Map();

  constructor(candidates: CandidateHypothesis[] = [], options?: SchedulingPolicyOptions) {
    for (const c of candidates) {
      this.registerHypothesis(c, options);
    }
  }

  registerHypothesis(candidate: CandidateHypothesis, options?: SchedulingPolicyOptions): ScheduledHypothesisProfile {
    const priorConfidence = candidate.confidence ?? 0.5;
    const estimatedCostSec = estimateHypothesisCost(candidate);
    const informationGain = computeBinaryEntropy(priorConfidence);

    // Cost efficiency: E[IG] / Cost
    const costWeight = options?.costWeight ?? 1.0;
    const efficiencyScore = informationGain / (estimatedCostSec * costWeight + 0.1);

    const profile: ScheduledHypothesisProfile = {
      hypothesisId: candidate.id,
      candidate,
      priorConfidence,
      estimatedCostSec,
      informationGain,
      efficiencyScore,
      status: "QUEUED",
    };

    this.profiles.set(candidate.id, profile);
    return profile;
  }

  /**
   * Returns candidates sorted by descending efficiency score (best information gain per cost first).
   */
  getPrioritizedSchedule(): ScheduledHypothesisProfile[] {
    return Array.from(this.profiles.values())
      .filter((p) => p.status === "QUEUED")
      .sort((a, b) => b.efficiencyScore - a.efficiencyScore);
  }

  /**
   * Selects the next best batch of candidates to experiment on, respecting a concurrent worker limit.
   */
  scheduleNextBatch(limit: number = 2): CandidateHypothesis[] {
    const sorted = this.getPrioritizedSchedule();
    const selected = sorted.slice(0, limit);
    for (const p of selected) {
      p.status = "RUNNING";
    }
    return selected.map((p) => p.candidate);
  }

  /**
   * Updates belief probabilities using Bayesian inference upon receiving experiment or falsification evidence.
   * Also updates correlated hypotheses sharing the same architectural level or strategy.
   */
  recordExperimentOutcome(
    hypothesisId: string,
    outcome: { falsified: boolean; testScore?: number; evidenceStrength?: number }
  ): ScheduledHypothesisProfile | undefined {
    const profile = this.profiles.get(hypothesisId);
    if (!profile) return undefined;

    const strength = outcome.evidenceStrength ?? 0.8;

    if (outcome.falsified) {
      profile.status = "FALSIFIED";
      profile.posteriorConfidence = 0.0;
      profile.efficiencyScore = 0.0;

      // Correlated dampening: other hypotheses at the same level take a slight prior penalty
      for (const [id, other] of this.profiles.entries()) {
        if (id !== hypothesisId && other.candidate.level === profile.candidate.level && other.status === "QUEUED") {
          other.priorConfidence = Math.max(0.1, other.priorConfidence * (1.0 - strength * 0.25));
          other.informationGain = computeBinaryEntropy(other.priorConfidence);
          other.efficiencyScore = other.informationGain / (other.estimatedCostSec + 0.1);
        }
      }
    } else {
      profile.status = "SURVIVED";
      // Bayesian update toward confidence: P(H|E) = (P(E|H) * P(H)) / P(E)
      const p = profile.priorConfidence;
      const posterior = (strength * p) / (strength * p + (1 - strength) * (1 - p));
      profile.posteriorConfidence = Math.min(1.0, Math.max(0.0, posterior));
    }

    return profile;
  }

  getAllProfiles(): ScheduledHypothesisProfile[] {
    return Array.from(this.profiles.values());
  }
}
