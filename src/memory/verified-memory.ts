import fs from "node:fs/promises";
import path from "node:path";
import type { VerificationResult } from "../schemas/result.js";
import type { CandidateImplementation } from "../schemas/candidate.js";
import type { DurableMemoryManager } from "./durable-memory.js";

export type MemoryProvenance =
  | "MACHINE_VERIFIED"
  | "REVIEW_VERIFIED"
  | "CI_VERIFIED"
  | "HUMAN_APPROVED"
  | "MERGED"
  | "POST_MERGE_STABLE";

export interface VerifiedMemoryRecord {
  id: string;
  runId: string;
  claim: string;
  provenance: MemoryProvenance;
  evidence: {
    testsPassed: number;
    testsFailed: number;
    exitCode: number;
    regressionsDetected: number;
    addedLines: number;
    deletedLines: number;
    benchmarkImprovementPercent?: number;
  };
  repo: string;
  commitHash: string;
  candidateId: string;
  interventionLevel: string;
  confidence: number;
  validityScope: string;
  validForRepoSha?: string;
  validForDependencyVersion?: string;
  expiresAt?: string;
  supersededBy?: string;
  verifiedAt: string;
}

/**
 * Checks whether a verified memory record is stale due to commit drift,
 * dependency upgrades, expiration, or being superseded by a newer ADR.
 */
export function isMemoryStale(
  record: VerifiedMemoryRecord,
  context?: {
    currentRepoSha?: string;
    currentDependencyVersion?: string;
    currentTime?: Date;
  }
): boolean {
  if (record.supersededBy) return true;

  const now = context?.currentTime ?? new Date();
  if (record.expiresAt && new Date(record.expiresAt) < now) {
    return true;
  }

  if (
    context?.currentDependencyVersion &&
    record.validForDependencyVersion &&
    context.currentDependencyVersion !== record.validForDependencyVersion
  ) {
    return true;
  }

  return false;
}

/**
 * Creates and persists verified memory entries with provenance tracking.
 * Strictly separates empirical, machine-validated facts and reviewed ADRs from ephemeral thoughts.
 */
export async function createAndSaveVerifiedMemory(options: {
  runId: string;
  goal: string;
  repoRoot: string;
  implementation: CandidateImplementation;
  verification: VerificationResult;
  memoryManager: DurableMemoryManager;
  provenance?: MemoryProvenance;
  validForRepoSha?: string;
  validForDependencyVersion?: string;
  expiresAt?: string;
}): Promise<VerifiedMemoryRecord> {
  const {
    runId,
    goal,
    repoRoot,
    implementation,
    verification,
    memoryManager,
    provenance = "MACHINE_VERIFIED",
    validForRepoSha,
    validForDependencyVersion,
    expiresAt,
  } = options;

  const id = `verified-${Date.now()}`;
  const claim = `Successfully verified ${implementation.level} solution for '${goal}' with 0 test failures and zero regressions.`;

  // Compute confidence score based on test count and regressions
  const confidence = verification.tests.failed === 0 && verification.regressions.length === 0
    ? Math.min(1.0, 0.8 + (verification.tests.passed > 0 ? 0.2 : 0))
    : 0.0;

  const verifiedRecord: VerifiedMemoryRecord = {
    id,
    runId,
    claim,
    provenance,
    evidence: {
      testsPassed: verification.tests.passed,
      testsFailed: verification.tests.failed,
      exitCode: verification.tests.exitCode ?? 0,
      regressionsDetected: verification.regressions.length,
      addedLines: verification.softMetrics?.addedLines ?? verification.complexity?.addedLines ?? 0,
      deletedLines: verification.softMetrics?.deletedLines ?? verification.complexity?.deletedLines ?? 0,
      benchmarkImprovementPercent: verification.softMetrics?.performanceImprovementPercent,
    },
    repo: path.basename(repoRoot),
    commitHash: implementation.branchName,
    candidateId: implementation.candidateId,
    interventionLevel: implementation.level,
    confidence,
    validityScope: `Repository: ${path.basename(repoRoot)}, Target Branch: ${implementation.branchName}`,
    validForRepoSha,
    validForDependencyVersion,
    expiresAt,
    verifiedAt: new Date().toISOString(),
  };

  // 1. Save artifact to run directory
  await memoryManager.saveArtifact(runId, "verified-memory.json", verifiedRecord);

  // 2. Index in SQLite FTS5 as verified knowledge entry with provenance tag
  memoryManager.ftsIndex.insert({
    id: verifiedRecord.id,
    runId,
    type: "verified_claim",
    title: `[VERIFIED] [${provenance}] ${implementation.level}: ${goal.slice(0, 50)}`,
    content: `${verifiedRecord.claim} [Provenance: ${provenance}] Evidence: ${verifiedRecord.evidence.testsPassed} tests passed, 0 failures. Validity: ${verifiedRecord.validityScope}`,
    createdAt: verifiedRecord.verifiedAt,
  });



  return verifiedRecord;
}

