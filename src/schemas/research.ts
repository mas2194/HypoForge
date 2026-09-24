import { z } from "zod";

export const PriorArtSchema = z.object({
  method: z.string(),
  summary: z.string(),
  outcomes: z.string(),
  limitations: z.string(),
});

export type PriorArt = z.infer<typeof PriorArtSchema>;

export const SotaApproachSchema = z.object({
  technique: z.string(),
  advantagesOverLegacy: z.string(),
});

export type SotaApproach = z.infer<typeof SotaApproachSchema>;

export const ResearchBriefSchema = z.object({
  problemClassification: z.string(),
  priorArt: z.array(PriorArtSchema),
  sotaApproaches: z.array(SotaApproachSchema),
  suggestedArchitecturalPatterns: z.array(z.string()),
  pitfallsToAvoid: z.array(z.string()),
  keyReferences: z.array(z.string()).default([]),
});

export type ResearchBrief = z.infer<typeof ResearchBriefSchema>;
