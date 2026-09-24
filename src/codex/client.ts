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

export type { SandboxMode, ApprovalMode };

export interface CodexClientOptions {
  defaultSandboxMode?: SandboxMode;
  defaultApprovalPolicy?: ApprovalMode;
  defaultModel?: string;
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
  public readonly defaultModel: string;

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
    this.defaultModel =
      options.defaultModel ??
      process.env.CODEX_MODEL ??
      process.env.OPENAI_MODEL ??
      "gpt-6-luna";
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
