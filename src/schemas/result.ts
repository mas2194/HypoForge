import { z } from "zod";

export const HardGateResultSchema = z.object({
  testsPassed: z.boolean().default(true),
  noRegressions: z.boolean().default(true),
  typecheckPassed: z.boolean().default(true),
  lintPassed: z.boolean().default(true),
  passedAll: z.boolean().default(true),
  failureReasons: z.array(z.string()).default([]),
});

export type HardGateResult = z.infer<typeof HardGateResultSchema>;

export const SoftMetricsSchema = z.object({
  performanceImprovementPercent: z.number().default(0),
  complexityDelta: z.number().default(0),
  addedLines: z.number().default(0),
  deletedLines: z.number().default(0),
  fileCount: z.number().default(0),
  architecturalInterventionLevel: z.number().default(1),
  confidenceScore: z.number().default(1.0),
});

export type SoftMetrics = z.infer<typeof SoftMetricsSchema>;

export const VerificationResultSchema = z.object({
  candidateId: z.string(),
  isBaseline: z.boolean().default(false),
  hardGates: HardGateResultSchema.default({
    testsPassed: true,
    noRegressions: true,
    typecheckPassed: true,
    lintPassed: true,
    passedAll: true,
    failureReasons: [],
  }),
  softMetrics: SoftMetricsSchema.default({
    performanceImprovementPercent: 0,
    complexityDelta: 0,
    addedLines: 0,
    deletedLines: 0,
    fileCount: 0,
    architecturalInterventionLevel: 1,
    confidenceScore: 1.0,
  }),
  tests: z.object({
    passed: z.number(),
    failed: z.number(),
    output: z.string(),
    exitCode: z.number().default(0),
  }),
  benchmark: z
    .object({
      before: z.number(),
      after: z.number(),
      unit: z.string(),
    })
    .optional(),
  complexity: z
    .object({
      addedLines: z.number(),
      deletedLines: z.number(),
      fileCount: z.number(),
    })
    .optional(),
  regressions: z.array(z.string()).default([]),
  score: z.number().default(0),
});

export type VerificationResult = z.infer<typeof VerificationResultSchema>;

export const ReviewResultSchema = z.object({
  approved: z.boolean(),
  blockingIssues: z.array(z.string()),
  suggestions: z.array(z.string()),
  feedback: z.string(),
});

export type ReviewResult = z.infer<typeof ReviewResultSchema>;
