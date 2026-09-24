import { z } from "zod";
import { InterventionLevelSchema } from "./diagnosis.js";

export const GitStrategyBranchSchema = z.object({
  name: z.string(),
  purpose: z.string(),
  dependsOn: z.string().optional(),
});

export const GitStrategySchema = z.object({
  type: z.enum(["single-pr", "split-pr", "stacked-pr"]),
  branches: z.array(GitStrategyBranchSchema),
});

export type GitStrategy = z.infer<typeof GitStrategySchema>;

export const CandidateImplementationSchema = z.object({
  candidateId: z.string(),
  level: InterventionLevelSchema,
  worktreePath: z.string(),
  branchName: z.string(),
  status: z.enum(["pending", "implementing", "completed", "failed"]),
});

export type CandidateImplementation = z.infer<typeof CandidateImplementationSchema>;
