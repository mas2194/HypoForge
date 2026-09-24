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

export const ResearchSourceTypeSchema = z.enum([
  "EMPIRICAL_PROBE",       // Verified by running isolated micro-script in active workspace / worktree
  "INSTALLED_PACKAGE_AST", // Extracted directly from node_modules typing / AST
  "OFFICIAL_DOCS",        // Official documentation / RFC / GitHub Release Notes
  "SECONDARY_SOURCE",      // Blog posts, StackOverflow, community discussions
  "LLM_PRIOR",            // Stochastic training knowledge
]);

export type ResearchSourceType = z.infer<typeof ResearchSourceTypeSchema>;

export const ResearchFactSchema = z.object({
  claim: z.string(),
  sourceType: ResearchSourceTypeSchema,
  sourceUri: z.string().optional(),
  targetPackage: z.string().optional(),
  installedVersion: z.string().optional(),
  empiricalVerificationPassed: z.boolean().default(false),
  retrievedAt: z.string(),
});

export type ResearchFact = z.infer<typeof ResearchFactSchema>;

export const ResearchBriefSchema = z.object({
  problemClassification: z.string(),
  priorArt: z.array(PriorArtSchema),
  sotaApproaches: z.array(SotaApproachSchema),
  suggestedArchitecturalPatterns: z.array(z.string()),
  pitfallsToAvoid: z.array(z.string()),
  keyReferences: z.array(z.string()).default([]),
  verifiedFacts: z.array(ResearchFactSchema).default([]),
});

export type ResearchBrief = z.infer<typeof ResearchBriefSchema>;

