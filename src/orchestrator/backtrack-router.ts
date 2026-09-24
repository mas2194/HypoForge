export enum BacktrackTarget {
  Implement = "Implement", // Local implementation fix without re-diagnosing
  Falsify = "Falsify",     // Counter-argument and edge-case re-scrutiny
  Diagnose = "Diagnose",   // Re-diagnose root cause and formulate new hypotheses
  Research = "Research",   // Conduct deeper external literature / SOTA survey
  Inspect = "Inspect",     // Re-inspect repo structure and fundamental invariants
}

export interface BacktrackDecision {
  target: BacktrackTarget;
  failureMode: string;
  reason: string;
  recommendedAction: string;
}

const BACKTRACK_PATTERNS: Array<{
  target: BacktrackTarget;
  failureMode: string;
  pattern: RegExp;
  recommendation: string;
}> = [
  {
    target: BacktrackTarget.Inspect,
    failureMode: "Invariant / Repository Model Violation",
    pattern: /\b(invariant|repo\s*structure|architecture\s*mismatch|broken\s*invariant|fundamental\s*assumption)\b/i,
    recommendation: "Re-inspect repository dependency graph, AST, and invariants before proceeding.",
  },
  {
    target: BacktrackTarget.Research,
    failureMode: "External Specification / Library Mismatch",
    pattern: /\b(external\s*library|api\s*spec|sota|version\s*mismatch|unsupported|deprecated\s*api|rfc|protocol\s*error)\b/i,
    recommendation: "Conduct targeted research on external library behavior and modern SOTA patterns.",
  },
  {
    target: BacktrackTarget.Falsify,
    failureMode: "Uncaught Counterexample / Falsification Leak",
    pattern: /\b(falsification\s*missed|counterexample|untested\s*edge\s*case|boundary\s*condition\s*untested)\b/i,
    recommendation: "Subject candidate to more rigorous falsification tests and stress scenarios.",
  },
  {
    target: BacktrackTarget.Implement,
    failureMode: "Localized Implementation / Syntax Defect",
    pattern: /\b(syntax\s*error|typo\s*in\s*code|compilation\s*error|off-by-one|missing\s*semicolon|import\s*typo)\b/i,
    recommendation: "Fix localized syntax or implementation typo directly in worktree.",
  },
  {
    target: BacktrackTarget.Diagnose,
    failureMode: "Architectural / Concurrency Flaw",
    pattern: /\b(deadlock|lock\s*contention|race\s*condition|concurrency\s*hazard|state\s*ownership|architecture\s*regression|root\s*cause)\b/i,
    recommendation: "Reformulate hypothesis at higher Intervention Ladder tier (L4-L6).",
  },
];

/**
 * Backtrack Router:
 * Inspects rejection feedback and diagnostic records to route backtracking
 * to the precise phase (Implement, Falsify, Diagnose, Research, or Inspect)
 * rather than blindly restarting the entire pipeline from scratch.
 */
export function routeBacktrack(rejectionReasons: string[]): BacktrackDecision {
  const combined = rejectionReasons.join(" ");

  for (const { target, failureMode, pattern, recommendation } of BACKTRACK_PATTERNS) {
    if (pattern.test(combined)) {
      return {
        target,
        failureMode,
        reason: `Matched failure pattern for '${failureMode}'`,
        recommendedAction: recommendation,
      };
    }
  }

  // Default fallback: Diagnose
  return {
    target: BacktrackTarget.Diagnose,
    failureMode: "General Verification / Review Failure",
    reason: "No specialized failure mode detected; returning to Diagnose for fresh hypothesis formulation.",
    recommendedAction: "Re-evaluate Intervention Ladder candidates with captured feedback.",
  };
}
