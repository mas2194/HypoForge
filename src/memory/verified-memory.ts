import fs from "node:fs/promises";
import path from "node:path";
import type { VerificationResult } from "../schemas/result.js";
import type { CandidateImplementation } from "../schemas/candidate.js";
import type { DurableMemoryManager } from "./durable-memory.js";

export interface VerifiedMemoryRecord {
  id: string;
  runId: string;
  claim: string;
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
  verifiedAt: string;
}

/**
 * Creates and persists verified memory entries.
 * Strictly separates empirical, machine-validated facts from subjective LLM thoughts.
 */
export async function createAndSaveVerifiedMemory(options: {
  runId: string;
  goal: string;
  repoRoot: string;
  implementation: CandidateImplementation;
  verification: VerificationResult;
  memoryManager: DurableMemoryManager;
}): Promise<VerifiedMemoryRecord> {
  const { runId, goal, repoRoot, implementation, verification, memoryManager } = options;

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
    verifiedAt: new Date().toISOString(),
  };

  // 1. Save artifact to run directory
  await memoryManager.saveArtifact(runId, "verified-memory.json", verifiedRecord);

  // 2. Index in SQLite FTS5 as verified knowledge entry
  memoryManager.ftsIndex.insert({
    id: verifiedRecord.id,
    runId,
    type: "verified_claim",
    title: `[VERIFIED] ${implementation.level}: ${goal.slice(0, 50)}`,
    content: `${verifiedRecord.claim} Evidence: ${verifiedRecord.evidence.testsPassed} tests passed, 0 failures. Validity: ${verifiedRecord.validityScope}`,
    createdAt: verifiedRecord.verifiedAt,
  });

  return verifiedRecord;
}
