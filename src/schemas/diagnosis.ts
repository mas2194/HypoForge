import { z } from "zod";

export const InterventionLevelSchema = z.enum([
  "local",
  "subsystem",
  "redesign",
]);

export type InterventionLevel = z.infer<typeof InterventionLevelSchema>;

export const CandidateHypothesisSchema = z.object({
  id: z.string(),
  level: InterventionLevelSchema,
  hypothesis: z.string(),
  experiment: z.string(),
  worthExperimenting: z.boolean().default(true),
});

export type CandidateHypothesis = z.infer<typeof CandidateHypothesisSchema>;

export const DiagnosisSchema = z.object({
  rootCause: z.string(),
  violatedInvariant: z.string(),
  currentArchitectureAssumption: z.string(),
  candidates: z.array(CandidateHypothesisSchema),
});

export type Diagnosis = z.infer<typeof DiagnosisSchema>;
