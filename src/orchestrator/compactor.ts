import type { HarnessContext } from "./context.js";
import { Phase } from "./context.js";
import { BacktrackTarget } from "./backtrack-router.js";

export interface InvalidationScope {
  research: boolean;
  hypotheses: boolean;
  diversityGate: boolean;
  falsification: boolean;
  implementations: boolean;
  verifications: boolean;
  paretoComparison: boolean;
  cleanRoomReview: boolean;
}

export const DEPENDENCY_INVALIDATION_MATRIX: Record<BacktrackTarget, InvalidationScope> = {
  [BacktrackTarget.Implement]: {
    research: false,
    hypotheses: false,
    diversityGate: false,
    falsification: false,
    implementations: true,
    verifications: true,
    paretoComparison: true,
    cleanRoomReview: true,
  },
  [BacktrackTarget.Falsify]: {
    research: false,
    hypotheses: false,
    diversityGate: false,
    falsification: true,
    implementations: true,
    verifications: true,
    paretoComparison: true,
    cleanRoomReview: true,
  },
  [BacktrackTarget.Diagnose]: {
    research: false,
    hypotheses: true,
    diversityGate: true,
    falsification: true,
    implementations: true,
    verifications: true,
    paretoComparison: true,
    cleanRoomReview: true,
  },
  [BacktrackTarget.Research]: {
    research: true,
    hypotheses: true,
    diversityGate: true,
    falsification: true,
    implementations: true,
    verifications: true,
    paretoComparison: true,
    cleanRoomReview: true,
  },
  [BacktrackTarget.Inspect]: {
    research: true,
    hypotheses: true,
    diversityGate: true,
    falsification: true,
    implementations: true,
    verifications: true,
    paretoComparison: true,
    cleanRoomReview: true,
  },
};

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
  target?: BacktrackTarget;
  scope?: InvalidationScope;
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
   * Applies the Dependency Invalidation Matrix based on the backtrack target phase:
   * selective invalidation preserves verified upstream artifacts while safely purging stale downstream state.
   */
  compactForBacktrack(ctx: HarnessContext, target?: BacktrackTarget): CompactionRecord {
    const purgedItems: string[] = [];
    const timestamp = new Date().toISOString();
    const effectiveTarget = target ?? BacktrackTarget.Diagnose;
    const scope = DEPENDENCY_INVALIDATION_MATRIX[effectiveTarget];

    // 1. Invalidate Review / Winning selection if scoped
    if (scope.cleanRoomReview) {
      if (ctx.winner) {
        purgedItems.push(`winner candidate '${ctx.winner.implementation.candidateId}'`);
        ctx.winner = undefined;
      }
      if (ctx.review) {
        purgedItems.push("clean-room review outcome");
        ctx.review = undefined;
      }
      ctx.rejectedCandidates = [];
      if (ctx.currentAttempt) {
        ctx.currentAttempt.winner = undefined;
        ctx.currentAttempt.review = undefined;
        ctx.currentAttempt.rejectedCandidates = [];
      }
    }

    // 2. Invalidate Pareto comparison & candidate queue if scoped
    if (scope.paretoComparison) {
      if (ctx.candidateQueue && ctx.candidateQueue.length > 0) {
        purgedItems.push(`candidateQueue (${ctx.candidateQueue.length} items)`);
        ctx.candidateQueue = [];
      }
      if (ctx.paretoComparison) {
        purgedItems.push("pareto comparison ranking");
        ctx.paretoComparison = undefined;
      }
      if (ctx.currentAttempt) {
        ctx.currentAttempt.candidateQueue = [];
      }
    }

    // 3. Invalidate Verifications if scoped (preserving immutable observations first)
    if (scope.verifications && ctx.verifications && ctx.verifications.length > 0) {
      for (const ver of ctx.verifications) {
        ctx.evidenceStore?.addObservation({
          source: `verification:${ver.candidateId}`,
          content: `Test exitCode=${ver.tests.exitCode}, passed=${ver.tests.passed}, failed=${ver.tests.failed}, lines=+${ver.softMetrics?.addedLines}/-${ver.softMetrics?.deletedLines}`,
          iteration: ctx.iteration,
          data: {
            candidateId: ver.candidateId,
            tests: ver.tests,
            regressions: ver.regressions,
            hardGates: ver.hardGates,
          },
        });
      }
      purgedItems.push(`verifications (${ctx.verifications.length} items persisted to evidence store)`);
      ctx.verifications = [];
      if (ctx.currentAttempt) {
        ctx.currentAttempt.verifications = [];
      }
    }

    // 4. Invalidate Implementations if scoped
    if (scope.implementations && ctx.implementations && ctx.implementations.length > 0) {
      purgedItems.push(`implementations (${ctx.implementations.length} items)`);
      ctx.implementations = [];
      if (ctx.currentAttempt) {
        ctx.currentAttempt.implementations = [];
        ctx.currentAttempt.worktreePaths = [];
      }
    }

    // 5. Invalidate Falsifications if scoped (preserving immutable inferences first)
    if (scope.falsification) {
      if (ctx.falsifiedCandidates && ctx.falsifiedCandidates.length > 0) {
        for (const fc of ctx.falsifiedCandidates) {
          ctx.evidenceStore?.addInference({
            source: `falsifier:${fc.id}`,
            content: `Hypothesis: ${fc.hypothesis}`,
            iteration: ctx.iteration,
            falsified: true,
            confidence: fc.confidence,
          });
        }
        purgedItems.push(`falsifiedCandidates (${ctx.falsifiedCandidates.length} items persisted to evidence store)`);
        ctx.falsifiedCandidates = undefined;
      }
      if (ctx.falsificationReviews) {
        purgedItems.push("falsification reviews");
        ctx.falsificationReviews = undefined;
      }
    }

    // 6. Invalidate Diversity Gate if scoped
    if (scope.diversityGate && ctx.diversityEvaluation) {
      purgedItems.push("diversityEvaluation");
      ctx.diversityEvaluation = undefined;
    }

    // 7. Invalidate Hypotheses / Diagnosis if scoped
    if (scope.hypotheses && ctx.diagnosis) {
      purgedItems.push(`diagnosis (${ctx.diagnosis.candidates.length} hypotheses invalidated)`);
      ctx.diagnosis = undefined;
    }

    // 8. Invalidate Research if scoped
    if (scope.research) {
      if (ctx.research) {
        purgedItems.push("research brief (invalidated due to external spec mismatch)");
        ctx.research = undefined;
      }
      if (ctx.researchRouting) {
        ctx.researchRouting = undefined;
      }
    }

    // 9. Distill rejection feedbacks into structured lessons / negative constraints
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

        if (cleaned.violatedInvariant) {
          ctx.evidenceStore?.addAssertion({
            source: cleaned.source,
            content: `Violated Invariant: ${cleaned.violatedInvariant}`,
            iteration: ctx.iteration,
          });
        }

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
      target: effectiveTarget,
      scope,
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
   * Strictly separates Positive Memories (ADRs/verified claims) from Negative Constraints (DO NOT rules).
   */
  buildDiagnosisPromptContext(ctx: HarnessContext): string | undefined {
    const sections: string[] = [];

    const recoveryHistory = ctx.recoveryHistory ?? [];
    if (recoveryHistory.length > 0) {
      sections.push(
        `PREVIOUS FAILED RUN RESULTS (Use this evidence to change the approach; do not repeat failed candidates or assumptions):\n${recoveryHistory.join("\n\n--- Previous attempt ---\n\n")}`
      );
    }

    // 1. Distilled Lessons and Negative Constraints from previous attempts & historical memories
    const lessons = ctx.distilledLessons ?? [];
    const historicalNegatives = (ctx.recalledMemories ?? [])
      .filter((m) => m.type === "negative_constraint" || m.type === "rejection" || m.type === "distilled_lesson");

    const negativeLines: string[] = [];

    // Add historical negative constraints from past runs
    for (const neg of historicalNegatives) {
      negativeLines.push(`- [Historical Negative / ${neg.type}] DO NOT: ${neg.content.slice(0, 180)} (Ref: ${neg.title})`);
    }

    // Add current run distilled lessons and feedbacks
    if (lessons.length > 0) {
      for (const l of lessons) {
        negativeLines.push(`- [Iteration ${l.iteration} / ${l.source}] ${l.lesson}${l.violatedInvariant ? ` (Invariant: ${l.violatedInvariant})` : ""}`);
      }
    } else if (ctx.rejectionFeedbacks.length > 0) {
      ctx.rejectionFeedbacks.forEach((f, i) => negativeLines.push(`- [Issue ${i + 1}] ${f}`));
    }

    if (negativeLines.length > 0) {
      sections.push(
        `CRITICAL NEGATIVE CONSTRAINTS (DO NOT REPEAT PREVIOUS ARCHITECTURAL FLAWS / ANTI-PATTERNS):\n${negativeLines.join("\n")}`
      );
    }

    // 2. Positive Memories: Historical ADRs, verified claims, and established architecture rules
    const positiveMemories = (ctx.recalledMemories ?? [])
      .filter((m) => m.type === "adr" || m.type === "verified_claim" || m.type === "architecture_rule");
    if (positiveMemories.length > 0) {
      const memoryLines = positiveMemories
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
