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

export interface WorkerOptions {
  workingDirectory: string;
  sandboxMode?: SandboxMode;
  approvalPolicy?: ApprovalMode;
  modelReasoningEffort?: ModelReasoningEffort;
  networkAccessEnabled?: boolean;
  webSearchMode?: WebSearchMode;
}

export class CodexClientManager {
  private codex: Codex;

  constructor() {
    this.codex = new Codex();
  }

  /**
   * Spawns an isolated Codex worker thread bounded to a specific worktree directory.
   */
  startWorkerThread(options: WorkerOptions): Thread {
    const threadOpts: ThreadOptions = {
      workingDirectory: options.workingDirectory,
      sandboxMode: options.sandboxMode ?? "workspace-write",
      approvalPolicy: options.approvalPolicy ?? "never",
      webSearchMode: options.webSearchMode ?? "live",
      webSearchEnabled: options.networkAccessEnabled ?? true,
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
