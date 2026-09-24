import { z } from "zod";

export const InterventionLadderLevelSchema = z.enum([
  "L0_configuration_typo",      // L0: Config / typo / localized bug
  "L1_function_implementation", // L1: Function logic / local algorithm
  "L2_module_responsibility",   // L2: Module responsibility / separation of concerns
  "L3_interface_api",           // L3: Interface / API signature
  "L4_state_data_model",        // L4: State ownership / data schema
  "L5_concurrency_execution",   // L5: Concurrency / execution flow
  "L6_architecture",            // L6: Subsystem / architectural boundaries
  "L7_requirement_assumption",  // L7: Requirement / fundamental assumption
]);

export type InterventionLadderLevel = z.infer<typeof InterventionLadderLevelSchema>;

export const LegacyInterventionLevelSchema = z.enum([
  "local",
  "subsystem",
  "redesign",
]);

export const InterventionLevelSchema = z.union([
  InterventionLadderLevelSchema,
  LegacyInterventionLevelSchema,
]);

export type InterventionLevel = z.infer<typeof InterventionLevelSchema>;

export function getLadderLevelNumber(level: InterventionLevel): number {
  switch (level) {
    case "L0_configuration_typo": return 0;
    case "L1_function_implementation":
    case "local": return 1;
    case "L2_module_responsibility": return 2;
    case "L3_interface_api":
    case "subsystem": return 3;
    case "L4_state_data_model": return 4;
    case "L5_concurrency_execution": return 5;
    case "L6_architecture":
    case "redesign": return 6;
    case "L7_requirement_assumption": return 7;
    default: return 1;
  }
}

export const CandidateHypothesisSchema = z.object({
  id: z.string(),
  level: InterventionLevelSchema,
  levelNumber: z.number().min(0).max(7).optional(),
  hypothesis: z.string(),
  rootCause: z.string().optional(),
  evidenceFor: z.array(z.string()).default([]),
  evidenceAgainst: z.array(z.string()).default([]),
  falsificationTest: z.string().optional(),
  predictedEffect: z.string().optional(),
  strategy: z.string().optional(), // e.g. "local_patch", "structural_redesign", "alternative_architecture"
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
