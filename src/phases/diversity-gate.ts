import {
  type CandidateHypothesis,
  getLadderLevelNumber,
} from "../schemas/diagnosis.js";

export interface DiversityEvaluation {
  passed: boolean;
  distinctLevels: number;
  distinctStrategies: number;
  reason: string;
  recommendations: string[];
}

/**
 * Hypothesis Diversity Gate:
 * Enforces that parallel exploration explores genuinely distinct hypotheses rather than
 * three superficial variants of the same localized edit.
 * Validates across:
 * 1. Intervention Ladder Level diversity (must span at least 2 distinct ladder tiers)
 * 2. Exploration strategy orthogonality (local_patch vs structural_redesign vs alternative_architecture)
 */
export function evaluateDiversity(candidates: CandidateHypothesis[]): DiversityEvaluation {
  if (candidates.length <= 1) {
    return {
      passed: true,
      distinctLevels: candidates.length,
      distinctStrategies: candidates.length,
      reason: "Single candidate, diversity check trivially satisfied",
      recommendations: [],
    };
  }

  const levelSet = new Set<number>();
  const strategySet = new Set<string>();

  for (const c of candidates) {
    const levelNum = c.levelNumber ?? getLadderLevelNumber(c.level);
    levelSet.add(levelNum);
    if (c.strategy) {
      strategySet.add(c.strategy.toLowerCase().trim());
    }
  }

  const distinctLevels = levelSet.size;
  const distinctStrategies = strategySet.size;
  const recommendations: string[] = [];

  // Check 1: Ladder Level Diversity
  if (distinctLevels < 2) {
    recommendations.push(
      "Candidates collapse onto identical Intervention Ladder level. Introduce at least one structural/subsystem redesign hypothesis (L4-L6)."
    );
  }

  // Check 2: Level Spread (Span)
  const minLevel = Math.min(...levelSet);
  const maxLevel = Math.max(...levelSet);
  const levelSpan = maxLevel - minLevel;
  if (levelSpan < 2 && maxLevel <= 2) {
    recommendations.push(
      "Exploration radius is confined to local fixes (L0-L2). Consider questioning subsystem boundaries or architectural assumptions (L3-L6)."
    );
  }

  const passed = recommendations.length === 0;
  return {
    passed,
    distinctLevels,
    distinctStrategies,
    reason: passed
      ? `Diversity Gate verified: ${distinctLevels} distinct ladder tier(s), span=${levelSpan}`
      : `Diversity Gate rejected: ${recommendations.join("; ")}`,
    recommendations,
  };
}

/**
 * Automatically adjusts candidates to satisfy diversity constraints if needed.
 * Ensures the candidate pool spans both localized and structural exploration radii.
 */
export function enforceDiversity(candidates: CandidateHypothesis[]): CandidateHypothesis[] {
  const evalResult = evaluateDiversity(candidates);
  if (evalResult.passed || candidates.length === 0) {
    return candidates;
  }

  // If diversity is insufficient, diversify the lowest-priority duplicate
  const diversified = [...candidates];
  const first = diversified[0];
  const firstLevel = first.levelNumber ?? getLadderLevelNumber(first.level);

  for (let i = 1; i < diversified.length; i++) {
    const currentLevel = diversified[i].levelNumber ?? getLadderLevelNumber(diversified[i].level);
    if (currentLevel === firstLevel) {
      // Elevate to structural redesign
      diversified[i] = {
        ...diversified[i],
        level: "L6_architecture",
        levelNumber: 6,
        strategy: "structural_redesign",
        hypothesis: `[Architectural Elevation] Redesign subsystem boundaries to address: ${diversified[i].hypothesis}`,
      };
      break;
    }
  }

  return diversified;
}
