export interface ResearchRoutingDecision {
  shouldResearch: boolean;
  reason: string;
  detectedSignals: string[];
}

const RESEARCH_SIGNALS: Array<{ pattern: RegExp; signal: string }> = [
  { pattern: /\b(latency|throughput|sub-millisecond|performance|benchmark|bottleneck)\b/i, signal: "Performance / Latency Target" },
  { pattern: /\b(concurrency|concurrent|lock-free|atomic|spin-lock|thread|mutex|race\s*condition)\b/i, signal: "Concurrency / Execution Model" },
  { pattern: /\b(algorithm|data\s*structure|index|indexing|b-tree|lsm|cache|eviction)\b/i, signal: "Algorithm / Data Structure Selection" },
  { pattern: /\b(redesign|architecture|architectural|refactor\s*core|subsystem|boundary)\b/i, signal: "Architectural Redesign" },
  { pattern: /\b(sota|state-of-the-art|prior\s*art|literature|survey|paper|rfc|protocol)\b/i, signal: "SOTA / Literature Survey Request" },
  { pattern: /\b(external\s*api|third-party|migration|upgrade\s*major|incompatible)\b/i, signal: "External Interface / API Shift" },
];

/**
 * Determines whether external literature / prior-art research is warranted for a given goal.
 * Prevents unnecessary LLM/Web research overhead for routine, local tasks.
 */
export function routeResearch(goal: string, context?: string): ResearchRoutingDecision {
  const combined = `${goal} ${context ?? ""}`;
  const detectedSignals: string[] = [];

  for (const { pattern, signal } of RESEARCH_SIGNALS) {
    if (pattern.test(combined)) {
      detectedSignals.push(signal);
    }
  }

  if (detectedSignals.length > 0) {
    return {
      shouldResearch: true,
      reason: `Warranted by architectural/performance signals: ${detectedSignals.join(", ")}`,
      detectedSignals,
    };
  }

  return {
    shouldResearch: false,
    reason: "Routine or localized task without high-uncertainty architectural signals",
    detectedSignals: [],
  };
}
