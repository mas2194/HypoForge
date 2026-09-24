import type { EvidenceItem, EvidenceKind } from "../schemas/evidence.js";

export interface PromptViewSection {
  title: string;
  kind: EvidenceKind;
  items: string[];
}

export interface PromptProjection {
  factsAndObservations: string[];
  activeAssertions: string[];
  survivingInferences: string[];
  refutedInferences: string[];
  recentDecisions: string[];
  formattedPromptText: string;
}

/**
 * Structured Evidence Store:
 * Implements immutable, 4-tier separation of empirical facts from stochastic model inferences.
 * The Compactor cannot mutate or delete raw observations; it only computes filtered projection views for LLM prompts.
 */
export class StructuredEvidenceStore {
  private items: EvidenceItem[] = [];

  addObservation(params: {
    source: string;
    content: string;
    iteration?: number;
    data?: Record<string, unknown>;
  }): EvidenceItem {
    const item: EvidenceItem = {
      id: `obs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      kind: "OBSERVATION",
      source: params.source,
      content: params.content,
      iteration: params.iteration ?? 1,
      data: params.data,
      timestamp: new Date().toISOString(),
      immutable: true,
    };
    this.items.push(item);
    return item;
  }

  addAssertion(params: {
    source: string;
    content: string;
    iteration?: number;
    data?: Record<string, unknown>;
  }): EvidenceItem {
    const item: EvidenceItem = {
      id: `asr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      kind: "ASSERTION",
      source: params.source,
      content: params.content,
      iteration: params.iteration ?? 1,
      data: params.data,
      timestamp: new Date().toISOString(),
      immutable: true,
    };
    this.items.push(item);
    return item;
  }

  addInference(params: {
    source: string;
    content: string;
    iteration?: number;
    confidence?: number;
    falsified?: boolean;
    data?: Record<string, unknown>;
  }): EvidenceItem {
    const item: EvidenceItem = {
      id: `inf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      kind: "INFERENCE",
      source: params.source,
      content: params.content,
      iteration: params.iteration ?? 1,
      confidence: params.confidence ?? 0.7,
      falsified: params.falsified ?? false,
      data: params.data,
      timestamp: new Date().toISOString(),
      immutable: false,
    };
    this.items.push(item);
    return item;
  }

  addDecision(params: {
    source: string;
    content: string;
    iteration?: number;
    data?: Record<string, unknown>;
  }): EvidenceItem {
    const item: EvidenceItem = {
      id: `dec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      kind: "DECISION",
      source: params.source,
      content: params.content,
      iteration: params.iteration ?? 1,
      data: params.data,
      timestamp: new Date().toISOString(),
      immutable: true,
    };
    this.items.push(item);
    return item;
  }

  getItems(filter?: { kind?: EvidenceKind; iteration?: number }): EvidenceItem[] {
    return this.items.filter((item) => {
      if (filter?.kind && item.kind !== filter.kind) return false;
      if (filter?.iteration && item.iteration !== filter.iteration) return false;
      return true;
    });
  }

  getAllObservations(): EvidenceItem[] {
    return this.getItems({ kind: "OBSERVATION" });
  }

  getAllAssertions(): EvidenceItem[] {
    return this.getItems({ kind: "ASSERTION" });
  }

  getAllInferences(): EvidenceItem[] {
    return this.getItems({ kind: "INFERENCE" });
  }

  getAllDecisions(): EvidenceItem[] {
    return this.getItems({ kind: "DECISION" });
  }

  /**
   * Generates a clear, non-conflated projection for LLM prompt context.
   * Strictly separates Ground-Truth Facts from Refuted and Active Inferences.
   */
  projectPromptView(options?: { currentIteration?: number; maxItemsPerKind?: number }): PromptProjection {
    const max = options?.maxItemsPerKind ?? 5;
    const obs = this.getAllObservations().slice(-max).map((o) => `[FACT/${o.source}] ${o.content}`);
    const asr = this.getAllAssertions().slice(-max).map((a) => `[INVARIANT/${a.source}] ${a.content}`);
    
    const inf = this.getAllInferences();
    const surviving = inf
      .filter((i) => !i.falsified)
      .slice(-max)
      .map((i) => `[HYPOTHESIS (conf: ${i.confidence ?? 0.7})] ${i.content}`);
    const refuted = inf
      .filter((i) => i.falsified)
      .slice(-max)
      .map((i) => `[REFUTED] ${i.content}`);

    const dec = this.getAllDecisions().slice(-max).map((d) => `[DECISION] ${d.content}`);

    const lines: string[] = [];
    if (obs.length > 0) {
      lines.push("### Ground-Truth Empirical Observations (Facts)");
      lines.push(...obs.map((o) => `- ${o}`));
      lines.push("");
    }
    if (asr.length > 0) {
      lines.push("### Active Architectural Invariants (Must Respect)");
      lines.push(...asr.map((a) => `- ${a}`));
      lines.push("");
    }
    if (refuted.length > 0) {
      lines.push("### Falsified Hypotheses (Do Not Repeat)");
      lines.push(...refuted.map((r) => `- ${r}`));
      lines.push("");
    }
    if (surviving.length > 0) {
      lines.push("### Plausible Inferences Under Investigation");
      lines.push(...surviving.map((s) => `- ${s}`));
      lines.push("");
    }

    return {
      factsAndObservations: obs,
      activeAssertions: asr,
      survivingInferences: surviving,
      refutedInferences: refuted,
      recentDecisions: dec,
      formattedPromptText: lines.join("\n"),
    };
  }
}
