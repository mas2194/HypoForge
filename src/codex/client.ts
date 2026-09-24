import {
  Codex,
  type ApprovalMode,
  type SandboxMode,
  type ModelReasoningEffort,
  type WebSearchMode,
  type ThreadOptions,
  type Thread,
} from "@openai/codex-sdk";
import { Agent } from "@openai/agents";
import {
  resolveDefaultModel,
  resolveDefaultEffort,
  type CodexModelInfo,
  loadCachedModels,
} from "./config.js";

export type { SandboxMode, ApprovalMode, ModelReasoningEffort, WebSearchMode };

export interface CodexClientOptions {
  defaultSandboxMode?: SandboxMode;
  defaultApprovalPolicy?: ApprovalMode;
  defaultModel?: string;
  defaultModelReasoningEffort?: ModelReasoningEffort;
}

export interface WorkerOptions {
  workingDirectory: string;
  sandboxMode?: SandboxMode;
  approvalPolicy?: ApprovalMode;
  modelReasoningEffort?: ModelReasoningEffort;
  networkAccessEnabled?: boolean;
  webSearchMode?: WebSearchMode;
  model?: string;
}

export class CodexClientManager {
  private codex: Codex;
  public readonly defaultSandboxMode: SandboxMode;
  public readonly defaultApprovalPolicy: ApprovalMode;
  public defaultModel: string;
  public defaultModelReasoningEffort: ModelReasoningEffort;

  constructor(options: CodexClientOptions = {}) {
    this.codex = new Codex();
    this.defaultSandboxMode =
      options.defaultSandboxMode ??
      (process.env.CODEX_SANDBOX_MODE as SandboxMode) ??
      "danger-full-access";
    this.defaultApprovalPolicy =
      options.defaultApprovalPolicy ??
      (process.env.CODEX_APPROVAL_POLICY as ApprovalMode) ??
      "never";
    this.defaultModel = resolveDefaultModel(options.defaultModel);
    this.defaultModelReasoningEffort = resolveDefaultEffort(options.defaultModelReasoningEffort);
  }

  /**
   * Dynamically switch active model for subsequent threads.
   */
  setModel(model: string): void {
    this.defaultModel = model.trim();
  }

  /**
   * Dynamically switch active reasoning effort for subsequent threads.
   */
  setReasoningEffort(effort: ModelReasoningEffort): void {
    this.defaultModelReasoningEffort = effort;
  }

  /**
   * Spawns an isolated Codex worker thread bounded to a specific worktree directory.
   */
  startWorkerThread(options: WorkerOptions): Thread {
    const threadOpts: ThreadOptions = {
      workingDirectory: options.workingDirectory,
      sandboxMode: options.sandboxMode ?? this.defaultSandboxMode,
      approvalPolicy: options.approvalPolicy ?? this.defaultApprovalPolicy,
      webSearchMode: options.webSearchMode ?? "live",
      webSearchEnabled: options.networkAccessEnabled ?? true,
      model: options.model ?? this.defaultModel,
      modelReasoningEffort: options.modelReasoningEffort ?? this.defaultModelReasoningEffort,
    };

    return this.codex.startThread(threadOpts);
  }

  /**
   * High-level Agents SDK integration for multi-agent reasoning and orchestration.
   */
  createMultiAgent(name: string, instructions: string, tools: any[] = []) {
    return new Agent({
      name,
      instructions,
      tools,
    });
  }
}
