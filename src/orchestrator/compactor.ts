import type { HarnessContext } from "./context.js";
import { Phase } from "./context.js";

export interface DistilledLesson {
  iteration: number;
  source: string;
  lesson: string;
  violatedInvariant?: string;
}

export interface CompactionRecord {
  timestamp: string;
  iteration: number;
  phase: Phase;
  reason: "backtrack" | "phase_transition" | "budget_limit";
  purgedItems: string[];
  distilledCount: number;
  summary: string;
}

export interface CompactorOptions {
  maxRetainedFeedbacks?: number;
  maxTraceHistory?: number;
}

export class ContextCompactor {
  private maxRetainedFeedbacks: number;
  private maxTraceHistory: number;

  constructor(options?: CompactorOptions) {
    this.maxRetainedFeedbacks = options?.maxRetainedFeedbacks ?? 2;
    this.maxTraceHistory = options?.maxTraceHistory ?? 50;
  }

  /**
   * Distills and compacts the blackboard context when backtracking for a self-healing retry.
   * Purges transient execution artifacts (worktree implementations, raw test results, winning selection),
   * extracts core invariant violations from rejection feedbacks, and indexes them into durable memory.
   */
  compactForBacktrack(ctx: HarnessContext): CompactionRecord {
    const purgedItems: string[] = [];
    const timestamp = new Date().toISOString();

    // 1. Purge transient implementation and verification artifacts from prior attempt
    if (ctx.implementations && ctx.implementations.length > 0) {
      purgedItems.push(`implementations (${ctx.implementations.length} items)`);
      ctx.implementations = [];
    }

    if (ctx.verifications && ctx.verifications.length > 0) {
      purgedItems.push(`verifications (${ctx.verifications.length} items)`);
      ctx.verifications = [];
    }

    if (ctx.winner) {
      purgedItems.push(`winner candidate '${ctx.winner.implementation.candidateId}'`);
      ctx.winner = undefined;
    }

    if (ctx.falsifiedCandidates && ctx.falsifiedCandidates.length > 0) {
      purgedItems.push(`falsifiedCandidates (${ctx.falsifiedCandidates.length} items)`);
      ctx.falsifiedCandidates = undefined;
    }

    // 2. Distill rejection feedbacks into structured lessons / negative constraints
    const rawFeedbacks = [...ctx.rejectionFeedbacks];
    let distilledCount = 0;

    if (!ctx.distilledLessons) {
      ctx.distilledLessons = [];
    }

    for (const feedback of rawFeedbacks) {
      const cleaned = this.extractCoreLesson(feedback);
      if (cleaned && !ctx.distilledLessons.some((l) => l.lesson === cleaned.lesson)) {
        ctx.distilledLessons.push({
          iteration: ctx.iteration,
          source: cleaned.source,
          lesson: cleaned.lesson,
          violatedInvariant: cleaned.violatedInvariant,
        });
        distilledCount++;

        // Persist distilled lesson into SQLite FTS5 for cross-run durability
        try {
          ctx.memoryManager.ftsIndex.insert({
            id: `lesson:${ctx.runId}:iter${ctx.iteration}:${distilledCount}`,
            type: "distilled_lesson",
            title: `Iter ${ctx.iteration} lesson: ${cleaned.source}`,
            content: cleaned.lesson,
            tags: `distilled lesson iteration-${ctx.iteration}`,
          });
        } catch (err) {
          console.warn("[ContextCompactor] Warning indexing distilled lesson into FTS5:", err);
        }
      }
    }

    // 3. Compact raw rejection feedback array to keep only distilled summaries and latest few items
    if (ctx.rejectionFeedbacks.length > this.maxRetainedFeedbacks) {
      const retained = ctx.rejectionFeedbacks.slice(-this.maxRetainedFeedbacks);
      const distilledSummary = `[Compacted ${ctx.rejectionFeedbacks.length - this.maxRetainedFeedbacks} prior failure(s)] Core issues: ${ctx.distilledLessons
        .slice(-3)
        .map((l) => l.lesson)
        .join("; ")}`;
      ctx.rejectionFeedbacks = [distilledSummary, ...retained];
      purgedItems.push(`condensed ${rawFeedbacks.length} feedbacks to ${ctx.rejectionFeedbacks.length}`);
    }

    // 4. Prune traceLog history if unbounded
    if (ctx.traceLog.length > this.maxTraceHistory) {
      const dropCount = ctx.traceLog.length - this.maxTraceHistory;
      ctx.traceLog = ctx.traceLog.slice(-this.maxTraceHistory);
      purgedItems.push(`pruned ${dropCount} old trace records`);
    }

    const summary = `Compacted context for Iteration ${ctx.iteration}: purged ${purgedItems.length} categories, distilled ${distilledCount} lessons.`;

    const record: CompactionRecord = {
      timestamp,
      iteration: ctx.iteration,
      phase: ctx.phase,
      reason: "backtrack",
      purgedItems,
      distilledCount,
      summary,
    };

    if (!ctx.compactionRecords) {
      ctx.compactionRecords = [];
    }
    ctx.compactionRecords.push(record);

    console.log(`[ContextCompactor] ${summary}`);
    return record;
  }

  /**
   * Cleanses and compacts context when transitioning across major phase milestones
   */
  compactForPhaseTransition(ctx: HarnessContext, targetPhase: Phase): CompactionRecord {
    const purgedItems: string[] = [];
    const timestamp = new Date().toISOString();

    // After review phase has approved, we can clear unnecessary review chatter
    if (targetPhase === Phase.Integrate && ctx.review?.approved) {
      purgedItems.push("raw review chatter");
    }

    const record: CompactionRecord = {
      timestamp,
      iteration: ctx.iteration,
      phase: targetPhase,
      reason: "phase_transition",
      purgedItems,
      distilledCount: 0,
      summary: `Phase transition compaction before entering ${targetPhase}`,
    };

    if (!ctx.compactionRecords) {
      ctx.compactionRecords = [];
    }
    ctx.compactionRecords.push(record);

    return record;
  }

  /**
   * Builds a token-efficient, high-signal prompt projection for the Architect/Diagnosis phase.
   * Replaces unstructured concatenations with categorized constraints and invariants.
   */
  buildDiagnosisPromptContext(ctx: HarnessContext): string | undefined {
    const sections: string[] = [];

    // 1. Distilled Lessons and Negative Constraints from previous attempts
    const lessons = ctx.distilledLessons ?? [];
    if (lessons.length > 0 || ctx.rejectionFeedbacks.length > 0) {
      const feedbackLines = lessons.length > 0
        ? lessons.map((l) => `- [Iteration ${l.iteration} / ${l.source}] ${l.lesson}`)
        : ctx.rejectionFeedbacks.map((f, i) => `- Issue ${i + 1}: ${f}`);

      sections.push(
        `CRITICAL NEGATIVE CONSTRAINTS (DO NOT REPEAT PREVIOUS ARCHITECTURAL FLAWS):\n${feedbackLines.join("\n")}`
      );
    }

    // 2. Historical ADRs and Invariants from Durable Memory (compact title & excerpt)
    if (ctx.recalledMemories && ctx.recalledMemories.length > 0) {
      const memoryLines = ctx.recalledMemories
        .slice(0, 3)
        .map((m) => `- [${m.type.toUpperCase()}] ${m.title}: ${m.content.slice(0, 160)}...`);
      sections.push(`HISTORICAL ARCHITECTURAL DECISIONS & INVARIANTS:\n${memoryLines.join("\n")}`);
    }

    // 3. Crystallized Skills (if any)
    if (ctx.activeSkills && ctx.activeSkills.length > 0) {
      const skillLines = ctx.activeSkills
        .slice(0, 2)
        .map((s) => `- ${s.name}: ${s.instructions.slice(0, 120)}`);
      sections.push(`VERIFIED PROCEDURAL SKILLS:\n${skillLines.join("\n")}`);
    }

    return sections.length > 0 ? sections.join("\n\n") : undefined;
  }

  /**
   * Parses raw feedback strings to extract concise lessons and violated invariants.
   */
  private extractCoreLesson(feedback: string): { source: string; lesson: string; violatedInvariant?: string } {
    let source = "Feedback";
    let lesson = feedback.trim();
    let violatedInvariant: string | undefined;

    if (feedback.startsWith("Clean-room review rejected candidate:")) {
      source = "CleanRoomReview";
      lesson = feedback.replace("Clean-room review rejected candidate:", "").trim();
      violatedInvariant = "Architecture or safety invariant violated during clean-room review";
    } else if (feedback.includes("No candidate implementation passed the test suite")) {
      source = "Verification";
      lesson = "All candidates failed functional test suites; verify logic and interfaces";
      violatedInvariant = "Functional correctness invariant";
    } else if (feedback.includes("All proposed candidates were falsified")) {
      source = "Falsification";
      lesson = "Proposed candidates failed counter-argument scrutiny; search different abstraction level";
      violatedInvariant = "Falsifiable hypothesis invariant";
    }

    // Remove verbose stack traces or repeated prefixes if present
    lesson = lesson.split("\n")[0].trim();
    if (lesson.length > 250) {
      lesson = lesson.slice(0, 247) + "...";
    }

    return { source, lesson, violatedInvariant };
  }
}
