import type { ModelReasoningEffort } from "@openai/codex-sdk";
import { HarnessStateMachine } from "../orchestrator/state-machine.js";
import {
  resolveDefaultModel,
  resolveDefaultEffort,
  loadCachedModels,
  type CodexModelInfo,
} from "../codex/config.js";
import {
  executeSlashCommand,
  type SlashCommandContext,
} from "../codex/commands.js";
import { resolveFileMentions } from "../codex/file-mention.js";
import {
  HarnessEventBus,
  type ChatMessageEvent,
  type SubAgentEvent,
  type NodeStatusEvent,
  type PhaseChangeEvent,
  type HarnessFinishEvent,
} from "./event-bus.js";

export interface RunnerStatus {
  isRunning: boolean;
  model: string;
  effort: ModelReasoningEffort;
  availableModels: CodexModelInfo[];
  activeGoal?: string;
  activeRunId?: string;
  lastFinish?: HarnessFinishEvent;
}

export class HarnessRunner {
  public model: string;
  public effort: ModelReasoningEffort;
  public readonly eventBus: HarnessEventBus;
  private isRunning: boolean = false;
  private activeGoal?: string;
  private activeRunId?: string;
  private lastFinish?: HarnessFinishEvent;

  public chatHistory: ChatMessageEvent[] = [];
  public subAgentHistory: SubAgentEvent[] = [];
  public nodeHistory: NodeStatusEvent[] = [];
  public phaseHistory: PhaseChangeEvent[] = [];

  constructor(options?: {
    model?: string;
    effort?: ModelReasoningEffort;
    eventBus?: HarnessEventBus;
  }) {
    this.model = resolveDefaultModel(options?.model);
    this.effort = resolveDefaultEffort(options?.effort);
    this.eventBus = options?.eventBus ?? new HarnessEventBus();

    // Cache event history for new web client connections
    this.eventBus.on("server_event", (event) => {
      switch (event.type) {
        case "chat:message":
          this.chatHistory.push(event.data);
          break;
        case "subagent:event":
          this.subAgentHistory.push(event.data);
          break;
        case "node:status":
          this.nodeHistory.push(event.data);
          break;
        case "phase:change":
          this.phaseHistory.push(event.data);
          break;
        case "harness:finish":
          this.lastFinish = event.data;
          this.isRunning = false;
          break;
      }
    });
  }

  getStatus(): RunnerStatus {
    return {
      isRunning: this.isRunning,
      model: this.model,
      effort: this.effort,
      availableModels: loadCachedModels(),
      activeGoal: this.activeGoal,
      activeRunId: this.activeRunId,
      lastFinish: this.lastFinish,
    };
  }

  setModel(model: string): void {
    this.model = model.trim();
    this.eventBus.emitChat({
      id: `sys-${Date.now()}`,
      role: "system",
      text: `Active model switched to **${this.model}**.`,
    });
  }

  setEffort(effort: ModelReasoningEffort): void {
    this.effort = effort;
    this.eventBus.emitChat({
      id: `sys-${Date.now()}`,
      role: "system",
      text: `Reasoning effort set to **${this.effort}**.`,
    });
  }

  getSlashContext(): SlashCommandContext {
    return {
      currentModel: this.model,
      currentEffort: this.effort,
      availableModels: loadCachedModels(),
      setModel: (m: string) => this.setModel(m),
      setEffort: (e: ModelReasoningEffort) => this.setEffort(e),
      testCommand: process.env.HARNESS_TEST_COMMAND,
      useCodex:
        process.env.USE_CODEX !== undefined
          ? process.env.USE_CODEX !== "false" && process.env.USE_CODEX !== "0"
          : true,
    };
  }

  async handleUserMessage(input: string): Promise<void> {
    const trimmed = input.trim();
    if (!trimmed) return;

    // Record user message
    this.eventBus.emitChat({
      id: `user-${Date.now()}`,
      role: "user",
      text: trimmed,
    });

    // Check for slash commands
    if (trimmed.startsWith("/") || trimmed === "@" || trimmed === "@help") {
      const res = executeSlashCommand(trimmed, this.getSlashContext());
      this.eventBus.emitChat({
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text: res.output || (res.handled ? "Command executed." : "Unknown command."),
      });
      return;
    }

    if (this.isRunning) {
      this.eventBus.emitChat({
        id: `sys-${Date.now()}`,
        role: "system",
        text: "⚠️ A harness task is already currently running. Please wait for completion before submitting a new goal.",
      });
      return;
    }

    // Resolve file mentions (@file)
    let expandedPrompt = trimmed;
    try {
      const resolution = await resolveFileMentions(trimmed);
      expandedPrompt = resolution.expandedPrompt;
      if (resolution.files.length > 0) {
        const fileList = resolution.files.map((f) => `\`${f.path}\``).join(", ");
        this.eventBus.emitChat({
          id: `sys-${Date.now()}`,
          role: "system",
          text: `📁 Loaded ${resolution.files.length} file(s) into context: ${fileList}`,
        });
      }
    } catch (err: any) {
      this.eventBus.emitChat({
        id: `sys-${Date.now()}`,
        role: "system",
        text: `❌ Error loading specified file(s): ${err.message}`,
      });
      return;
    }

    // Start Harness run
    this.isRunning = true;
    this.activeGoal = trimmed;
    this.activeRunId = `run-${Date.now()}`;

    this.eventBus.emitChat({
      id: `assistant-${Date.now()}`,
      role: "assistant",
      text: `🚀 Starting autonomous architecture exploration for goal:\n> "${trimmed}"\n\n- **Model**: \`${this.model}\`\n- **Reasoning Effort**: \`${this.effort}\``,
    });

    this.eventBus.emitEvent({
      type: "harness:status",
      data: { running: true, activeGoal: trimmed, phase: "Inspect" },
    });

    // Run asynchronously
    (async () => {
      try {
        const useCodex =
          process.env.USE_CODEX !== undefined
            ? process.env.USE_CODEX !== "false" && process.env.USE_CODEX !== "0"
            : true;

        const harness = new HarnessStateMachine({
          goal: expandedPrompt,
          useCodex,
          codexModel: this.model,
          codexModelReasoningEffort: this.effort,
          testCommand: process.env.HARNESS_TEST_COMMAND,
          eventBus: this.eventBus,
        });

        const finalState = await harness.runUntilFinished();

        let responseText = `### Execution Summary\n- **Final Phase**: \`${finalState.phase}\`\n`;
        if (finalState.recoveryHistory?.length) {
          responseText += `- **Automatic full restarts**: ${finalState.recoveryHistory.length}\n`;
        }
        if (finalState.error) {
          responseText += `- **Last error**: ${finalState.error.replace(/\n/g, " ")}\n`;
        }
        if (finalState.winner) {
          responseText += `- **Winning Candidate**: \`${finalState.winner.implementation.candidateId}\` (${finalState.winner.implementation.level})\n`;
          responseText += `- **Evidence Score**: **${finalState.winner.verification.score.toFixed(2)}**\n`;
          if (finalState.verifiedCommitSha) {
            responseText += `- **Verified Commit SHA**: \`${finalState.verifiedCommitSha}\`\n`;
          }
          if (finalState.publishedPrUrl) {
            responseText += `- **Pull Request**: [${finalState.publishedPrUrl}](${finalState.publishedPrUrl})\n`;
          }
          if (finalState.adrFilename) {
            responseText += `- **Architecture Decision Record**: \`${finalState.adrFilename}\`\n`;
          }
        } else {
          responseText += "- **Result**: No candidate solution passed all Hard Gates.\n";
          if (finalState.unresolvedReason) {
            responseText += `- **Reason**: ${finalState.unresolvedReason}\n`;
          }
        }

        this.eventBus.emitChat({
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: responseText,
        });
      } catch (err: any) {
        this.eventBus.emitChat({
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: `💥 **Execution error**: ${err?.message || String(err)}`,
        });
        this.eventBus.emitFinish({
          runId: this.activeRunId || `run-${Date.now()}`,
          phase: "Finished" as any,
          error: String(err),
          summary: `Run aborted due to error: ${err?.message}`,
        });
      } finally {
        this.isRunning = false;
        this.activeGoal = undefined;
        this.eventBus.emitEvent({
          type: "harness:status",
          data: { running: false },
        });
      }
    })();
  }
}
