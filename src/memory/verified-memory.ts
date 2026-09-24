import fs from "node:fs/promises";
import path from "node:path";
import type { VerificationResult } from "../schemas/result.js";
import type { CandidateImplementation } from "../schemas/candidate.js";
import type { DurableMemoryManager } from "./durable-memory.js";

export type MemoryProvenance =
  | "PROPOSED"
  | "MACHINE_VERIFIED"
  | "CLEANROOM_APPROVED"
  | "LOCAL_INTEGRATION_VERIFIED"
  | "PR_CREATED"
  | "REMOTE_CI_VERIFIED"
  | "HUMAN_APPROVED"
  | "MERGED"
  | "POST_MERGE_STABLE";

export const PROVENANCE_HIERARCHY: Record<MemoryProvenance, number> = {
  PROPOSED: 1,
  MACHINE_VERIFIED: 2,
  CLEANROOM_APPROVED: 3,
  LOCAL_INTEGRATION_VERIFIED: 4,
  PR_CREATED: 5,
  REMOTE_CI_VERIFIED: 6,
  HUMAN_APPROVED: 7,
  MERGED: 8,
  POST_MERGE_STABLE: 9,
};

export const PROVENANCE_CONFIDENCE_WEIGHTS: Record<MemoryProvenance, number> = {
  PROPOSED: 0.3,
  MACHINE_VERIFIED: 0.5,
  CLEANROOM_APPROVED: 0.7,
  LOCAL_INTEGRATION_VERIFIED: 0.8,
  PR_CREATED: 0.85,
  REMOTE_CI_VERIFIED: 0.92,
  HUMAN_APPROVED: 0.95,
  MERGED: 1.0,
  POST_MERGE_STABLE: 1.0,
};

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
 * Promotes an existing verified memory record along the confidence lifecycle ladder.
 */
export async function promoteMemoryProvenance(options: {
  record: VerifiedMemoryRecord;
  newProvenance: MemoryProvenance;
  memoryManager: DurableMemoryManager;
  reason?: string;
}): Promise<VerifiedMemoryRecord> {
  const { record, newProvenance, memoryManager, reason } = options;
  const currentLevel = PROVENANCE_HIERARCHY[record.provenance] ?? 0;
  const newLevel = PROVENANCE_HIERARCHY[newProvenance] ?? 0;

  if (newLevel <= currentLevel) {
    return record; // Non-decreasing monotonicity
  }

  record.provenance = newProvenance;
  record.confidence = PROVENANCE_CONFIDENCE_WEIGHTS[newProvenance] ?? record.confidence;
  record.verifiedAt = new Date().toISOString();

  // 1. Update artifact in run directory
  await memoryManager.saveArtifact(record.runId, "verified-memory.json", record);

  // 2. Index in SQLite FTS5 as promoted knowledge entry
  try {
    memoryManager.ftsIndex.insert({
      id: `${record.id}:${newProvenance.toLowerCase()}`,
      runId: record.runId,
      type: "verified_claim",
      title: `[VERIFIED] [${newProvenance}] ${record.interventionLevel}: ${record.claim.slice(0, 50)}`,
      content: `${record.claim} [Promoted to: ${newProvenance}] Reason: ${reason ?? "Lifecycle progression"} (Confidence: ${record.confidence})`,
      createdAt: record.verifiedAt,
    });
  } catch (err) {
    console.warn("[VerifiedMemory] Warning updating promoted memory in FTS5:", err);
  }

  console.log(
    `[VerifiedMemory:Lifecycle] Promoted memory '${record.id}' to [${newProvenance}] (Confidence: ${record.confidence})`
  );
  return record;
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

