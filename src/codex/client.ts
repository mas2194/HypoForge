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
import { accessSync, constants } from "node:fs";
import path from "node:path";
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

/**
 * Finds a separately installed Codex CLI. This is important for bundled hosts,
 * where the SDK's optional platform package may not be available at runtime.
 */
function findCodexCli(): string | undefined {
  const configuredPath = process.env.CODEX_CLI_PATH?.trim();
  if (configuredPath) return configuredPath;

  const pathVariable = process.env.PATH ?? "";
  const executableNames = process.platform === "win32"
    ? [`codex${process.env.PATHEXT?.split(";")[0] ?? ".EXE"}`, "codex.exe", "codex.cmd", "codex.bat"]
    : ["codex"];

  for (const directory of pathVariable.split(path.delimiter).filter(Boolean)) {
    for (const executableName of executableNames) {
      const candidate = path.resolve(directory, executableName);
      try {
        accessSync(candidate, process.platform === "win32" ? constants.F_OK : constants.X_OK);
        return candidate;
      } catch {
        // Keep searching PATH entries.
      }
    }
  }

  return undefined;
}

export class CodexClientManager {
  private codex: Codex;
  public readonly defaultSandboxMode: SandboxMode;
  public readonly defaultApprovalPolicy: ApprovalMode;
  public defaultModel: string;
  public defaultModelReasoningEffort: ModelReasoningEffort;

  constructor(options: CodexClientOptions = {}) {
    this.codex = new Codex({ codexPathOverride: findCodexCli() });
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
