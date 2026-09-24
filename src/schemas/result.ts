import { z } from "zod";

export const VerificationResultSchema = z.object({
  candidateId: z.string(),
  tests: z.object({
    passed: z.number(),
    failed: z.number(),
    output: z.string(),
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
