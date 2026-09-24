import { z } from "zod";

export const HardGateResultSchema = z.object({
  testsPassed: z.boolean().default(true),
  noRegressions: z.boolean().default(true),
  typecheckPassed: z.boolean().default(true),
  lintPassed: z.boolean().default(true),
  testIntegrityPassed: z.boolean().default(true),
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

export const DiagnosticItemSchema = z.object({
  filePath: z.string(),
  line: z.number().optional(),
  column: z.number().optional(),
  code: z.string(),
  message: z.string(),
  identityHash: z.string(),
});

export type DiagnosticItem = z.infer<typeof DiagnosticItemSchema>;

export const MetamorphicResultSchema = z.object({
  tested: z.boolean().default(false),
  passed: z.boolean().default(true),
  properties: z.record(z.string(), z.boolean()).default({}),
  failureReasons: z.array(z.string()).default([]),
});

export type MetamorphicResult = z.infer<typeof MetamorphicResultSchema>;

export const VerificationResultSchema = z.object({
  candidateId: z.string(),
  isBaseline: z.boolean().default(false),
  hardGates: HardGateResultSchema.default({
    testsPassed: true,
    noRegressions: true,
    typecheckPassed: true,
    lintPassed: true,
    testIntegrityPassed: true,
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
    failingTestIds: z.array(z.string()).default([]),
    passingTestIds: z.array(z.string()).default([]),
  }),
  diagnostics: z
    .object({
      typeErrors: z.array(DiagnosticItemSchema).default([]),
      lintErrors: z.array(DiagnosticItemSchema).default([]),
    })
    .default({ typeErrors: [], lintErrors: [] }),
  metamorphic: MetamorphicResultSchema.default({
    tested: false,
    passed: true,
    properties: {},
    failureReasons: [],
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

export const FailureClassSchema = z.enum([
  "IMPLEMENTATION_ERROR", // localized syntax, typo, compilation -> Implement
  "FALSIFICATION_GAP",    // missed edge case, counterexample -> Falsify
  "ROOT_CAUSE_ERROR",     // incorrect hypothesis, invariant violation -> Diagnose
  "EXTERNAL_SPEC",        // third-party library / API / RFC mismatch -> Research
  "REPO_MODEL_ERROR",     // incorrect repo structure assumption -> Inspect
]);

export type FailureClass = z.infer<typeof FailureClassSchema>;

export const ReviewResultSchema = z.object({
  approved: z.boolean(),
  failureClass: FailureClassSchema.optional(),
  blockingIssues: z.array(z.string()),
  suggestions: z.array(z.string()),
  feedback: z.string(),
});

export type ReviewResult = z.infer<typeof ReviewResultSchema>;

