import type { RepoInspection, ProblemSignature } from "./inspect-repo.js";
import { routeResearch, type ResearchRoutingDecision } from "./research-router.js";

export type ExecutionPath = "FAST" | "DEEP";

export interface TriageDecision {
  path: ExecutionPath;
  reason: string;
  confidence: number;
  signals: string[];
  requiresResearch: boolean;
}

const FAST_PATH_PATTERNS = [
  /\b(typo|misspelling|rename\s*variable|rename\s*constant|docstring|comment|fix\s*logging|format\s*string|null\s*check|undefined\s*guard|simple\s*typo)\b/i,
  /\b(import\s*typo|missing\s*semicolon|update\s*readme|fix\s*spelling)\b/i,
];

const DEEP_PATH_TRIGGERS = [
  /\b(architecture|redesign|refactor\s*core|concurrency|race\s*condition|deadlock|mutex|lock-free)\b/i,
  /\b(performance|latency|throughput|benchmark|bottleneck|optimize\s*algorithm)\b/i,
  /\b(data\s*model|schema\s*migration|state\s*management|store|decouple)\b/i,
  /\b(breaking\s*change|deprecat|protocol|rfc|sota|literature)\b/i,
];

/**
 * Fast / Deep Path Triage:
 * Analyzes repository facts and the user goal to route trivial, localized tasks
 * to a lightweight fast-track (Implement -> Verify -> Review)
 * while directing complex, uncertain, or architectural tasks to the deep scientific pipeline
 * (Research -> Diagnose -> Diversity Gate -> Falsify -> Parallel Worktrees).
 */
export function triageExecutionPath(
  goal: string,
  inspection: RepoInspection,
  signature: ProblemSignature,
  researchDecision: ResearchRoutingDecision = routeResearch(goal)
): TriageDecision {
  const goalLower = goal.toLowerCase();
  const signals: string[] = [];

  // Check 1: Explicit deep triggers
  for (const pattern of DEEP_PATH_TRIGGERS) {
    if (pattern.test(goalLower)) {
      signals.push(`Matched deep trigger: ${pattern.source}`);
    }
  }

  // Check 2: Research signals
  if (researchDecision.shouldResearch) {
    signals.push(...researchDecision.detectedSignals);
  }

  // Check 3: Multi-module impact
  if (signature.relevantModules.length > 1) {
    signals.push(`Cross-subsystem task affecting ${signature.relevantModules.length} modules`);
  }

  if (signals.length > 0) {
    return {
      path: "DEEP",
      reason: `Requires deep exploration due to: ${signals.join("; ")}`,
      confidence: 0.95,
      signals,
      requiresResearch: researchDecision.shouldResearch,
    };
  }

  // Check 4: Fast path pattern match
  let matchedFastPattern = false;
  for (const pattern of FAST_PATH_PATTERNS) {
    if (pattern.test(goalLower)) {
      matchedFastPattern = true;
      break;
    }
  }

  // If simple localized pattern and isolated to <= 1 module
  if (matchedFastPattern && signature.relevantModules.length <= 1) {
    return {
      path: "FAST",
      reason: "Routine, localized task with zero architectural risk or concurrency hazards",
      confidence: 0.98,
      signals: ["Localized syntax / typo / null-check"],
      requiresResearch: false,
    };
  }

  // Default: When in doubt, prefer DEEP exploration to avoid regression
  return {
    path: "DEEP",
    reason: "Standard task requiring hypothesis formulation and falsification",
    confidence: 0.8,
    signals: ["Standard task"],
    requiresResearch: researchDecision.shouldResearch,
  };
}
