export interface BudgetLimits {
  maxIterations: number;
  maxCandidates: number;
  wallClockBudgetMs: number;
  maxTestRuns: number;
}

export interface BudgetUsage {
  iterations: number;
  candidatesEvaluated: number;
  testRuns: number;
  startTimeMs: number;
  elapsedMs: number;
}

export interface BudgetStatus {
  exhausted: boolean;
  reason?: string;
  usage: BudgetUsage;
  limits: BudgetLimits;
}

export const DEFAULT_BUDGET_LIMITS: BudgetLimits = {
  maxIterations: 3,
  maxCandidates: 8,
  wallClockBudgetMs: 15 * 60 * 1000, // 15 minutes default
  maxTestRuns: 16,
};

export class BudgetTracker {
  private limits: BudgetLimits;
  private startTimeMs: number;
  private iterations = 1;
  private candidatesEvaluated = 0;
  private testRuns = 0;

  constructor(limits?: Partial<BudgetLimits>) {
    this.limits = {
      ...DEFAULT_BUDGET_LIMITS,
      ...limits,
    };
    this.startTimeMs = Date.now();
  }

  recordIteration(iteration: number): void {
    this.iterations = iteration;
  }

  recordCandidates(count: number): void {
    this.candidatesEvaluated += count;
  }

  recordTestRun(): void {
    this.testRuns += 1;
  }

  getUsage(): BudgetUsage {
    const now = Date.now();
    return {
      iterations: this.iterations,
      candidatesEvaluated: this.candidatesEvaluated,
      testRuns: this.testRuns,
      startTimeMs: this.startTimeMs,
      elapsedMs: now - this.startTimeMs,
    };
  }

  getLimits(): BudgetLimits {
    return { ...this.limits };
  }

  checkBudget(): BudgetStatus {
    const usage = this.getUsage();

    if (usage.iterations > this.limits.maxIterations) {
      return {
        exhausted: true,
        reason: `Iteration budget exhausted (${usage.iterations} > ${this.limits.maxIterations})`,
        usage,
        limits: this.limits,
      };
    }

    if (usage.candidatesEvaluated > this.limits.maxCandidates) {
      return {
        exhausted: true,
        reason: `Candidate evaluation budget exhausted (${usage.candidatesEvaluated} > ${this.limits.maxCandidates})`,
        usage,
        limits: this.limits,
      };
    }

    if (usage.testRuns > this.limits.maxTestRuns) {
      return {
        exhausted: true,
        reason: `Test execution budget exhausted (${usage.testRuns} > ${this.limits.maxTestRuns})`,
        usage,
        limits: this.limits,
      };
    }

    if (usage.elapsedMs > this.limits.wallClockBudgetMs) {
      return {
        exhausted: true,
        reason: `Wall-clock execution timeout (${(usage.elapsedMs / 1000).toFixed(1)}s > ${(this.limits.wallClockBudgetMs / 1000).toFixed(1)}s)`,
        usage,
        limits: this.limits,
      };
    }

    return {
      exhausted: false,
      usage,
      limits: this.limits,
    };
  }
}
