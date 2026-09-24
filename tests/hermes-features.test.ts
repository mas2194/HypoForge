import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { FtsMemoryIndex } from "../src/memory/fts-index.js";
import { SkillManager } from "../src/skills/skill-manager.js";
import { TrajectoryExporter } from "../src/trajectory/exporter.js";
import type { HarnessContext } from "../src/orchestrator/context.js";
import { Phase } from "../src/orchestrator/context.js";

describe("Hermes-inspired Capabilities for my_harness", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harness-hermes-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("FtsMemoryIndex (SQLite FTS5 Full-Text Memory)", () => {
    it("should index and recall ADRs and rejections via natural language search", () => {
      const fts = new FtsMemoryIndex(":memory:");

      fts.insert({
        id: "adr:ADR-0001.md",
        type: "adr",
        title: "ADR-0001: Use Lock-Free Ring Buffer for Concurrent Pipeline",
        content: "We replaced the mutex-based queue with a single-producer single-consumer ring buffer to eliminate thread contention.",
        tags: "concurrency ring-buffer performance",
      });

      fts.insert({
        id: "rejection:run-123:cand-01",
        type: "rejection",
        title: "Clean-room review rejected mutex workaround",
        content: "Mutex addition inside the hot loop causes 40% latency regression under heavy load.",
        tags: "rejection mutex bottleneck",
      });

      // Search for concurrency / ring-buffer
      const results1 = fts.search("ring buffer concurrency");
      expect(results1.length).toBeGreaterThan(0);
      expect(results1[0].id).toBe("adr:ADR-0001.md");
      expect(results1[0].type).toBe("adr");

      // Search for mutex latency regression
      const results2 = fts.search("latency regression mutex");
      expect(results2.length).toBeGreaterThan(0);
      expect(results2[0].type).toBe("rejection");

      fts.close();
    });

    it("should handle empty or special character search queries safely", () => {
      const fts = new FtsMemoryIndex(":memory:");
      expect(fts.search("")).toEqual([]);
      expect(fts.search("   !@#$%^&*()   ")).toEqual([]);
      fts.close();
    });
  });

  describe("SkillManager (Procedural Knowledge Crystallization)", () => {
    it("should crystallize, persist, and match procedural skills based on goal triggers", async () => {
      const fts = new FtsMemoryIndex(":memory:");
      const manager = new SkillManager({ repoRoot: tmpDir, ftsIndex: fts });

      const skill = await manager.crystallizeSkill({
        name: "Run Ultra-Fast Benchmark",
        description: "Runs vitest benchmark with profiling flags",
        trigger: "benchmark latency",
        command: "npm run bench:fast",
        instructions: "Run benchmark with profiling enabled and verify P99 latency",
        tags: ["benchmark", "performance", "p99"],
      });

      expect(skill.id).toBe("run-ultra-fast-benchmark");
      expect(skill.successCount).toBe(1);

      // Match skills against goal
      const matched = await manager.matchSkills("We need to optimize benchmark latency for API");
      expect(matched.length).toBe(1);
      expect(matched[0].name).toBe("Run Ultra-Fast Benchmark");
      expect(matched[0].command).toBe("npm run bench:fast");

      // Record subsequent success
      await manager.recordSkillSuccess(skill.id);
      const updated = await manager.getSkillById(skill.id);
      expect(updated?.successCount).toBe(2);

      fts.close();
    });
  });

  describe("TrajectoryExporter (Offline RL & DPO Preference Pairs)", () => {
    it("should build structured trajectory with winning and rejected preference pairs", async () => {
      const exporter = new TrajectoryExporter(tmpDir);

      const fakeContext: HarnessContext = {
        goal: "Refactor storage engine for zero-copy read",
        runId: "run-test-42",
        repoRoot: tmpDir,
        testCommand: "npm test",
        publishPr: false,
        phase: Phase.Learn,
        finished: true,
        iteration: 1,
        rejectionFeedbacks: [],
        traceLog: [],
        recalledMemories: [],
        activeSkills: [],
        worktreeManager: {} as any,
        evaluator: {} as any,
        memoryManager: {} as any,
        skillManager: {} as any,
        trajectoryExporter: exporter,
        githubBroker: {} as any,
        diagnosis: {
          rootCause: "Memory copy in read path",
          violatedInvariant: "Zero-copy contract",
          currentArchitectureAssumption: "Buffer copying is required for safe memory ownership",
          candidates: [
            {
              id: "cand-local",
              level: "local",
              hypothesis: "Add cache around buffer copy",
              experiment: "test read latency",
              worthExperimenting: true,
            },
            {
              id: "cand-redesign",
              level: "redesign",
              hypothesis: "Introduce mmap based zero-copy reader abstraction",
              experiment: "benchmark zero-copy memory usage",
              worthExperimenting: true,
            },
          ],
        },
        implementations: [
          {
            candidateId: "cand-local",
            level: "local",
            worktreePath: "/tmp/worktree/cand-local",
            branchName: "agent/run-42/cand-local",
            status: "completed",
          },
          {
            candidateId: "cand-redesign",
            level: "redesign",
            worktreePath: "/tmp/worktree/cand-redesign",
            branchName: "agent/run-42/cand-redesign",
            status: "completed",
          },
        ],
        verifications: [
          {
            candidateId: "cand-local",
            tests: { passed: 5, failed: 0, output: "OK" },
            score: 110.0,
            regressions: [],
          },
          {
            candidateId: "cand-redesign",
            tests: { passed: 5, failed: 0, output: "OK" },
            score: 145.0,
            regressions: [],
          },
        ],
        winner: {
          implementation: {
            candidateId: "cand-redesign",
            level: "redesign",
            worktreePath: "/tmp/worktree/cand-redesign",
            branchName: "agent/run-42/cand-redesign",
            status: "completed",
          },
          verification: {
            candidateId: "cand-redesign",
            tests: { passed: 5, failed: 0, output: "OK" },
            score: 145.0,
            regressions: [],
          },
        },
      };

      const trajectory = exporter.buildTrajectory(fakeContext);
      expect(trajectory.runId).toBe("run-test-42");
      expect(trajectory.winnerCandidateId).toBe("cand-redesign");
      expect(trajectory.candidates.length).toBe(2);

      // Verify PreferencePair format for DPO / RL
      expect(trajectory.preferencePairs.length).toBe(1);
      const pair = trajectory.preferencePairs[0];
      expect(pair.chosen.candidateId).toBe("cand-redesign");
      expect(pair.chosen.score).toBe(145.0);
      expect(pair.rejected.candidateId).toBe("cand-local");
      expect(pair.rejected.score).toBe(110.0);
      expect(pair.rejected.rejectionReason).toContain("Lower verification score");

      // Verify file persistence
      const savedPath = await exporter.exportRunTrajectory(fakeContext);
      const fileContent = await fs.readFile(savedPath, "utf-8");
      const parsed = JSON.parse(fileContent);
      expect(parsed.winnerCandidateId).toBe("cand-redesign");
    });
  });
});
