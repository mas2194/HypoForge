import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DiagnosisSchema, type Diagnosis } from "../schemas/diagnosis.js";
import type { ResearchBrief } from "../schemas/research.js";
import type { CodexClientManager } from "../codex/client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ArchitectOptions {
  goal: string;
  context?: string;
  repoPath?: string;
  research?: ResearchBrief;
}

export async function runArchitectPhase(
  options: ArchitectOptions,
  codexManager?: CodexClientManager
): Promise<Diagnosis> {
  const promptPath = path.resolve(__dirname, "../../prompts/architect.md");
  let systemPrompt = "";
  try {
    systemPrompt = await fs.readFile(promptPath, "utf-8");
  } catch {
    systemPrompt = "You are the System Architect agent.";
  }

  const researchSection = options.research
    ? `
Prior Research, Literature, and SOTA Survey Findings:
- Domain Classification: ${options.research.problemClassification}
- Prior Art & Observed Outcomes:
${options.research.priorArt.map((p) => `  * ${p.method}: ${p.summary} -> Outcomes: ${p.outcomes}. Limitations: ${p.limitations}`).join("\n")}
- SOTA Approaches & Advantages:
${options.research.sotaApproaches.map((s) => `  * ${s.technique} (Advantages: ${s.advantagesOverLegacy})`).join("\n")}
- Suggested Architectural Patterns: ${options.research.suggestedArchitecturalPatterns.join(", ")}
- Known Pitfalls to Avoid: ${options.research.pitfallsToAvoid.join(", ")}

Instructions regarding Prior Research:
- Synthesize the above literature findings into your diagnosis.
- Avoid the known failure modes and pitfalls identified in the research.
- Formulate your architectural candidates (subsystem / redesign) drawing directly upon the proven patterns and SOTA approaches identified.
`
    : "";

  const userPrompt = `
Objective / Problem Statement:
${options.goal}

Additional Context:
${options.context ?? "None provided"}
${researchSection}

Generate a diagnosis with at least 2 distinct candidates across the Intervention Ladder:
1. One candidate with level "local" (incremental fix)
2. One candidate with level "subsystem" or "redesign" (architectural restructuring informed by research)

Respond strictly with a valid JSON object matching this schema:
{
  "rootCause": "string",
  "violatedInvariant": "string",
  "currentArchitectureAssumption": "string",
  "candidates": [
    {
      "id": "cand-local",
      "level": "local",
      "hypothesis": "string",
      "experiment": "string",
      "worthExperimenting": true
    },
    {
      "id": "cand-architecture",
      "level": "subsystem",
      "hypothesis": "string",
      "experiment": "string",
      "worthExperimenting": true
    }
  ]
}
`.trim();

  if (codexManager) {
    try {
      const thread = codexManager.startWorkerThread({
        workingDirectory: options.repoPath ?? process.cwd(),
      });
      const turn = await thread.run(`${systemPrompt}\n\n${userPrompt}`);
      const response = turn.finalResponse ?? "";
      // Find JSON block or parse direct response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return DiagnosisSchema.parse(parsed);
      }
    } catch (err) {
      console.warn("Codex architect call failed, falling back to heuristic diagnosis:", err);
    }
  }

  // Fallback / deterministic generation for testing or offline mode
  const redesignHypothesis = options.research?.sotaApproaches[0]
    ? `Adopt ${options.research.sotaApproaches[0].technique} leveraging ${options.research.suggestedArchitecturalPatterns[0] ?? "modern design pattern"}`
    : `Refactor module boundaries to fundamentally resolve: ${options.goal}`;

  const archAssumption = options.research?.priorArt[0]
    ? `Legacy design assumes ${options.research.priorArt[0].method}, which suffers from ${options.research.priorArt[0].limitations}`
    : "Existing code assumes current boundaries cannot be changed";

  return DiagnosisSchema.parse({
    rootCause: `Root friction identified for goal: ${options.goal}`,
    violatedInvariant: "Assumed system constraints may be unnecessary or restrictive",
    currentArchitectureAssumption: archAssumption,
    candidates: [
      {
        id: "cand-local",
        level: "local",
        hypothesis: `Apply localized patch for: ${options.goal}`,
        experiment: "Run existing test suite to verify no regressions",
        worthExperimenting: true,
      },
      {
        id: "cand-redesign",
        level: "subsystem",
        hypothesis: redesignHypothesis,
        experiment: "Run test suite and check architectural clarity",
        worthExperimenting: true,
      },
    ],
  });
}
