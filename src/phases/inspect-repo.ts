import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface RepoInspection {
  recentGitHistory: string[];
  changedFiles: string[];
  keyDependencies: string[];
  targetSubsystems: string[];
  repoLanguage: string;
}

export interface ProblemSignature {
  signatureId: string;
  domain: string;
  relevantModules: string[];
  searchTerms: string;
  failingReproductionSignal?: string;
}

/**
 * Inspects the target repository before consulting historical memory.
 * Extracts structural facts (Git history, changed files, dependencies, architecture layout)
 * to prevent Memory Anchoring.
 */
export async function inspectRepository(repoRoot: string): Promise<RepoInspection> {
  const recentGitHistory: string[] = [];
  const changedFiles: string[] = [];
  const keyDependencies: string[] = [];
  const targetSubsystems: string[] = [];

  // 1. Inspect recent Git history
  try {
    const { stdout } = await execAsync("git log -n 5 --oneline", { cwd: repoRoot });
    for (const line of stdout.trim().split("\n").filter(Boolean)) {
      recentGitHistory.push(line);
    }
  } catch {
    // Non-fatal
  }

  // 2. Inspect git status for untracked/modified files
  try {
    const { stdout } = await execAsync("git status --short", { cwd: repoRoot });
    for (const line of stdout.trim().split("\n").filter(Boolean)) {
      changedFiles.push(line.trim());
    }
  } catch {
    // Non-fatal
  }

  // 3. Inspect package.json / dependencies if present
  try {
    const pkgPath = path.resolve(repoRoot, "package.json");
    const raw = await fs.readFile(pkgPath, "utf-8");
    const parsed = JSON.parse(raw);
    const deps = { ...parsed.dependencies, ...parsed.devDependencies };
    keyDependencies.push(...Object.keys(deps).slice(0, 10));
  } catch {
    // Non-fatal
  }

  // 4. Scan primary subsystems in src/
  try {
    const srcPath = path.resolve(repoRoot, "src");
    const entries = await fs.readdir(srcPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        targetSubsystems.push(entry.name);
      }
    }
  } catch {
    // Non-fatal
  }

  return {
    recentGitHistory,
    changedFiles,
    keyDependencies,
    targetSubsystems,
    repoLanguage: "typescript",
  };
}

/**
 * Generates an objective problem signature based on repo inspection facts and the user goal.
 * This signature is subsequently used for targeted memory retrieval and skill matching,
 * eradicating subjective memory anchoring.
 */
export function generateProblemSignature(goal: string, inspection: RepoInspection): ProblemSignature {
  const signatureId = `sig-${Date.now()}`;
  const goalLower = goal.toLowerCase();

  // Find relevant subsystems matching the goal
  const relevantModules = inspection.targetSubsystems.filter((sub) =>
    goalLower.includes(sub.toLowerCase())
  );

  // Extract core keywords from goal without filler words
  const stopWords = new Set(["the", "a", "an", "for", "with", "and", "in", "to", "of", "on", "from"]);
  const tokens = goalLower
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  // Combine problem tokens and identified modules for high-precision FTS5 query
  const searchTerms = [...new Set([...tokens, ...relevantModules])].slice(0, 5).join(" OR ");

  return {
    signatureId,
    domain: relevantModules.length > 0 ? relevantModules[0] : "core",
    relevantModules,
    searchTerms: searchTerms || goal,
  };
}
