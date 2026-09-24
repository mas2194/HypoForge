import type { CodexClientManager } from "../codex/client.js";

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

/** Ask the configured model whether this goal needs external or prior-art research. */
export async function judgeResearchNeed(
  goal: string,
  context: string,
  codexManager?: CodexClientManager,
  repoPath?: string
): Promise<ResearchRoutingDecision> {
  if (!codexManager) return routeResearch(goal, context);

  const prompt = `Decide whether accomplishing the user's goal requires external research, prior-art comparison, current references, or domain evidence that is not reliably available from the repository alone. Interpret the request in its original language. Do not rely on keyword matching; infer the actual work requested. A request to assess novelty, compare against existing work, or evaluate a project from multiple evidence-based angles generally requires research. Routine local edits usually do not.

Goal:
${goal}

Repository context:
${context || "No additional context."}

Return only a JSON object with this shape:
{"shouldResearch":true,"reason":"short explanation","detectedSignals":["short evidence-based rationale"]}`;

  try {
    const thread = codexManager.startWorkerThread({
      workingDirectory: repoPath ?? process.cwd(),
      modelReasoningEffort: "low",
      webSearchMode: "disabled",
      networkAccessEnabled: false,
    });
    const turn = await thread.run(prompt, {
      outputSchema: {
        type: "object",
        properties: {
          shouldResearch: { type: "boolean" },
          reason: { type: "string" },
          detectedSignals: { type: "array", items: { type: "string" } },
        },
        required: ["shouldResearch", "reason", "detectedSignals"],
        additionalProperties: false,
      },
    });
    const response = turn.finalResponse ?? "";
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Research gate returned no JSON decision");
    const parsed = JSON.parse(jsonMatch[0]);
    if (typeof parsed.shouldResearch !== "boolean" || typeof parsed.reason !== "string") {
      throw new Error("Research gate returned an invalid decision");
    }
    return {
      shouldResearch: parsed.shouldResearch,
      reason: parsed.reason,
      detectedSignals: Array.isArray(parsed.detectedSignals)
        ? parsed.detectedSignals.filter((item: unknown): item is string => typeof item === "string")
        : [],
    };
  } catch (error) {
    console.warn("Model research gate failed; defaulting to research to avoid missing needed prior art:", error);
    return {
      shouldResearch: true,
      reason: "Model decision unavailable; defaulting to research for coverage.",
      detectedSignals: ["Research decision fallback"],
    };
  }
}

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
