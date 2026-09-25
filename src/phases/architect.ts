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

import { EMBEDDED_PROMPTS } from "../prompts/embedded.js";

export async function runArchitectPhase(
  options: ArchitectOptions,
  codexManager?: CodexClientManager
): Promise<Diagnosis> {
  const promptPath = path.resolve(__dirname, "../../prompts/architect.md");
  let systemPrompt = EMBEDDED_PROMPTS.architect;
  try {
    systemPrompt = await fs.readFile(promptPath, "utf-8");
  } catch {
    // Keep embedded prompt fallback
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
Intervention Ladder Levels:
- L0_configuration_typo: Config / typo / localized bug
- L1_function_implementation: Function logic / local algorithm
- L2_module_responsibility: Module responsibility / separation of concerns
- L3_interface_api: Interface / API signature
- L4_state_data_model: State ownership / data schema
- L5_concurrency_execution: Concurrency / execution flow
- L6_architecture: Subsystem / architectural boundaries
- L7_requirement_assumption: Requirement / fundamental assumption

Candidates must span different exploration radii (e.g., one L1 local fix, one L5/L6 structural redesign).

Respond strictly with a valid JSON object matching this schema:
{
  "rootCause": "string describing root cause",
  "violatedInvariant": "string describing the broken invariant",
  "currentArchitectureAssumption": "string describing assumption in existing design",
  "candidates": [
    {
      "id": "cand-local",
      "level": "L1_function_implementation",
      "levelNumber": 1,
      "hypothesis": "string hypothesis",
      "rootCause": "string root cause addressed",
      "evidenceFor": ["string evidence supporting this hypothesis"],
      "evidenceAgainst": ["string potential drawbacks or risks"],
      "falsificationTest": "string how to prove this hypothesis false",
      "predictedEffect": "string expected outcome",
      "strategy": "local_patch",
      "experiment": "string verification command or plan",
      "worthExperimenting": true
    },
    {
      "id": "cand-redesign",
      "level": "L6_architecture",
      "levelNumber": 6,
      "hypothesis": "string architectural redesign hypothesis",
      "rootCause": "string deeper structural cause",
      "evidenceFor": ["string evidence supporting redesign"],
      "evidenceAgainst": ["string architectural transition costs"],
      "falsificationTest": "string test proving redesign inadequate",
      "predictedEffect": "string long-term architectural stability",
      "strategy": "structural_redesign",
      "experiment": "string verification command or plan",
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
        level: "L1_function_implementation",
        levelNumber: 1,
        hypothesis: `Apply localized patch for: ${options.goal}`,
        rootCause: "Local implementation oversight or edge-case handling deficiency",
        evidenceFor: ["Isolated to single execution branch", "Directly reproducible with minimal test"],
        evidenceAgainst: ["May obscure deeper invariant conflict if repeated elsewhere"],
        falsificationTest: "Verify edge-case handling under stress load",
        predictedEffect: "Immediate bug resolution with minimal blast radius",
        strategy: "local_patch",
        experiment: "Run existing test suite to verify no regressions",
        worthExperimenting: true,
      },
      {
        id: "cand-redesign",
        level: "L6_architecture",
        levelNumber: 6,
        hypothesis: redesignHypothesis,
        rootCause: `Fundamental architectural boundary friction: ${archAssumption}`,
        evidenceFor: ["Eliminates recurrent class of defects", "Aligns with proven SOTA pattern"],
        evidenceAgainst: ["Higher integration footprint", "Requires subsystem boundary refactoring"],
        falsificationTest: "Verify architectural invariant consistency and zero regression",
        predictedEffect: "Decouples component responsibilities and unlocks scalable throughput",
        strategy: "structural_redesign",
        experiment: "Run test suite and check architectural clarity",
        worthExperimenting: true,
      },
    ],
  });
}
