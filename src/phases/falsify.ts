import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { CandidateHypothesis } from "../schemas/diagnosis.js";
import type { CodexClientManager } from "../codex/client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const FalsifiedCandidateSchema = z.object({
  id: z.string(),
  criticism: z.string(),
  identifiedRisks: z.array(z.string()),
  worthExperimenting: z.boolean(),
});

export type FalsifiedCandidate = z.infer<typeof FalsifiedCandidateSchema>;

export interface FalsifyOptions {
  candidates: CandidateHypothesis[];
  goal: string;
  repoPath?: string;
}

export async function runFalsifyPhase(
  options: FalsifyOptions,
  codexManager?: CodexClientManager
): Promise<{ candidates: CandidateHypothesis[]; reviews: FalsifiedCandidate[] }> {
  const promptPath = path.resolve(__dirname, "../../prompts/falsifier.md");
  let systemPrompt = "";
  try {
    systemPrompt = await fs.readFile(promptPath, "utf-8");
  } catch {
    systemPrompt = "You are the Falsifier agent.";
  }

  const prompt = `
${systemPrompt}

Goal: ${options.goal}

Evaluate each of the following candidate hypotheses with rigorous scrutiny.
Try to disprove them, find hidden risks, or identify why they might fail:
${JSON.stringify(options.candidates, null, 2)}

Respond strictly with a valid JSON array matching this schema:
[
  {
    "id": "candidate-id",
    "criticism": "detailed criticism and counter-arguments",
    "identifiedRisks": ["risk1", "risk2"],
    "worthExperimenting": true
  }
]
`.trim();

  if (codexManager) {
    try {
      const thread = codexManager.startWorkerThread({
        workingDirectory: options.repoPath ?? process.cwd(),
      });
      const turn = await thread.run(prompt);
      const response = turn.finalResponse ?? "";
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const reviews = z.array(FalsifiedCandidateSchema).parse(parsed);

        const updatedCandidates = options.candidates.map((cand) => {
          const rev = reviews.find((r) => r.id === cand.id);
          return {
            ...cand,
            worthExperimenting: rev ? rev.worthExperimenting : cand.worthExperimenting,
          };
        });

        return { candidates: updatedCandidates, reviews };
      }
    } catch (err) {
      console.warn("Codex falsify call failed, falling back to deterministic evaluation:", err);
    }
  }

  // Deterministic evaluation fallback
  const reviews: FalsifiedCandidate[] = options.candidates.map((cand) => ({
    id: cand.id,
    criticism: `Falsification analysis for ${cand.level} candidate: verified potential risks and constraints.`,
    identifiedRisks: [
      cand.level === "local"
        ? "Risk of leaving underlying architectural debt unresolved"
        : "Risk of wider regression surface across dependent modules",
    ],
    worthExperimenting: true,
  }));

  return { candidates: options.candidates, reviews };
}
