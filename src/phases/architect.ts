import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DiagnosisSchema, type Diagnosis } from "../schemas/diagnosis.js";
import type { CodexClientManager } from "../codex/client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ArchitectOptions {
  goal: string;
  context?: string;
  repoPath?: string;
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

  const userPrompt = `
Objective / Problem Statement:
${options.goal}

Additional Context:
${options.context ?? "None provided"}

Generate a diagnosis with at least 2 distinct candidates across the Intervention Ladder:
1. One candidate with level "local" (incremental fix)
2. One candidate with level "subsystem" or "redesign" (architectural restructuring)

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
  return DiagnosisSchema.parse({
    rootCause: `Root friction identified for goal: ${options.goal}`,
    violatedInvariant: "Assumed system constraints may be unnecessary or restrictive",
    currentArchitectureAssumption: "Existing code assumes current boundaries cannot be changed",
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
        hypothesis: `Refactor module boundaries to fundamentally resolve: ${options.goal}`,
        experiment: "Run test suite and check architectural clarity",
        worthExperimenting: true,
      },
    ],
  });
}
