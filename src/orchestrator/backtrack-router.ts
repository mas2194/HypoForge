import type { FailureClass } from "../schemas/result.js";

export enum BacktrackTarget {
  Implement = "Implement", // Local implementation fix without re-diagnosing
  Falsify = "Falsify",     // Counter-argument and edge-case re-scrutiny
  Diagnose = "Diagnose",   // Re-diagnose root cause and formulate new hypotheses
  Research = "Research",   // Conduct deeper external literature / SOTA survey
  Inspect = "Inspect",     // Re-inspect repo structure and fundamental invariants
}

export interface BacktrackDecision {
  target: BacktrackTarget;
  failureClass: FailureClass;
  failureMode: string;
  reason: string;
  recommendedAction: string;
  evidenceIds: string[];
  confidence: number;
  diagnostics?: Record<string, unknown>;
}

const STRUCTURED_FAILURE_MAP: Record<FailureClass, {
  target: BacktrackTarget;
  failureMode: string;
  recommendedAction: string;
}> = {
  IMPLEMENTATION_ERROR: {
    target: BacktrackTarget.Implement,
    failureMode: "Localized Implementation / Syntax Defect",
    recommendedAction: "Fix localized syntax, typo, or compiler error directly in worktree.",
  },
  FALSIFICATION_GAP: {
    target: BacktrackTarget.Falsify,
    failureMode: "Uncaught Counterexample / Falsification Leak",
    recommendedAction: "Subject candidate to more rigorous falsification tests and stress scenarios.",
  },
  ROOT_CAUSE_ERROR: {
    target: BacktrackTarget.Diagnose,
    failureMode: "Hypothesis / Architectural Root Cause Flaw",
    recommendedAction: "Reformulate hypothesis across Intervention Ladder (L4-L6) with feedback.",
  },
  EXTERNAL_SPEC: {
    target: BacktrackTarget.Research,
    failureMode: "External Specification / Library Mismatch",
    recommendedAction: "Conduct targeted research on external library behavior and modern SOTA patterns.",
  },
  REPO_MODEL_ERROR: {
    target: BacktrackTarget.Inspect,
    failureMode: "Invariant / Repository Model Violation",
    recommendedAction: "Re-inspect repository dependency graph, AST, and invariants before proceeding.",
  },
};

const BACKTRACK_PATTERNS: Array<{
  target: BacktrackTarget;
  failureClass: FailureClass;
  failureMode: string;
  pattern: RegExp;
  recommendation: string;
}> = [
  {
    target: BacktrackTarget.Inspect,
    failureClass: "REPO_MODEL_ERROR",
    failureMode: "Invariant / Repository Model Violation",
    pattern: /\b(invariant|repo\s*structure|architecture\s*mismatch|broken\s*invariant|fundamental\s*assumption)\b/i,
    recommendation: "Re-inspect repository dependency graph, AST, and invariants before proceeding.",
  },
  {
    target: BacktrackTarget.Research,
    failureClass: "EXTERNAL_SPEC",
    failureMode: "External Specification / Library Mismatch",
    pattern: /\b(external\s*library|api\s*spec|sota|version\s*mismatch|unsupported|deprecated\s*api|rfc|protocol\s*error)\b/i,
    recommendation: "Conduct targeted research on external library behavior and modern SOTA patterns.",
  },
  {
    target: BacktrackTarget.Falsify,
    failureClass: "FALSIFICATION_GAP",
    failureMode: "Uncaught Counterexample / Falsification Leak",
    pattern: /\b(falsification\s*missed|counterexample|untested\s*edge\s*case|boundary\s*condition\s*untested)\b/i,
    recommendation: "Subject candidate to more rigorous falsification tests and stress scenarios.",
  },
  {
    target: BacktrackTarget.Implement,
    failureClass: "IMPLEMENTATION_ERROR",
    failureMode: "Localized Implementation / Syntax Defect",
    pattern: /\b(syntax\s*error|typo\s*in\s*code|compilation\s*error|off-by-one|missing\s*semicolon|import\s*typo)\b/i,
    recommendation: "Fix localized syntax or implementation typo directly in worktree.",
  },
  {
    target: BacktrackTarget.Diagnose,
    failureClass: "ROOT_CAUSE_ERROR",
    failureMode: "Architectural / Concurrency Flaw",
    pattern: /\b(deadlock|lock\s*contention|race\s*condition|concurrency\s*hazard|state\s*ownership|architecture\s*regression|root\s*cause)\b/i,
    recommendation: "Reformulate hypothesis at higher Intervention Ladder tier (L4-L6).",
  },
];

export interface RouteBacktrackOptions {
  evidenceIds?: string[];
  diagnostics?: Record<string, unknown>;
}

/**
 * Backtrack Router:
 * Inspects structured rejection failureClass (primary) and rejection feedback text (fallback)
 * to route backtracking to the precise phase with full evidence provenance and confidence.
 */
export function routeBacktrack(
  rejectionReasons: string[],
  failureClass?: FailureClass,
  options?: RouteBacktrackOptions
): BacktrackDecision {
  const evidenceIds = options?.evidenceIds ?? [];
  const diagnostics = options?.diagnostics;

  // 1. Primary: Deterministic mapping from structured failureClass (high confidence)
  if (failureClass && STRUCTURED_FAILURE_MAP[failureClass]) {
    const entry = STRUCTURED_FAILURE_MAP[failureClass];
    return {
      target: entry.target,
      failureClass,
      failureMode: entry.failureMode,
      reason: `Structured failureClass '${failureClass}' diagnosed by auditor`,
      recommendedAction: entry.recommendedAction,
      evidenceIds,
      confidence: 0.95,
      diagnostics,
    };
  }

  // 2. Fallback: Pattern match against rejection feedback text
  const combined = rejectionReasons.join(" ");
  for (const { target, failureClass: patClass, failureMode, pattern, recommendation } of BACKTRACK_PATTERNS) {
    if (pattern.test(combined)) {
      return {
        target,
        failureClass: patClass,
        failureMode,
        reason: `Matched failure pattern for '${failureMode}'`,
        recommendedAction: recommendation,
        evidenceIds,
        confidence: 0.80,
        diagnostics,
      };
    }
  }

  // 3. Default fallback: Diagnose
  return {
    target: BacktrackTarget.Diagnose,
    failureClass: "ROOT_CAUSE_ERROR",
    failureMode: "General Verification / Review Failure",
    reason: "No specialized failure mode detected; returning to Diagnose for fresh hypothesis formulation.",
    recommendedAction: "Re-evaluate Intervention Ladder candidates with captured feedback.",
    evidenceIds,
    confidence: 0.50,
    diagnostics,
  };
}

