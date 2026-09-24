import { z } from "zod";

export const EvidenceKindSchema = z.enum([
  "OBSERVATION", // Immutable empirical facts: test outputs, exit codes, git sha, diffs, benchmark metrics
  "ASSERTION",   // Specifications, invariants, ADR constraints, protected oracle checks
  "INFERENCE",   // Stochastic / model hypotheses: root causes, falsification results, suspected race conditions
  "DECISION",    // Harness control events: triage choices, backtrack routing, pareto selection
]);

export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;

export const EvidenceItemSchema = z.object({
  id: z.string(),
  kind: EvidenceKindSchema,
  source: z.string(), // e.g. "vitest", "falsifier", "triage", "compiler"
  timestamp: z.string(),
  iteration: z.number().default(1),
  content: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  immutable: z.boolean().default(true),
  falsified: z.boolean().optional(),
});

export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;
