import type { ModelReasoningEffort } from "@openai/codex-sdk";
import {
  VALID_REASONING_EFFORTS,
  EFFORT_DESCRIPTIONS,
  type CodexModelInfo,
  loadCachedModels,
  isValidReasoningEffort,
} from "./config.js";

export interface SlashCommandContext {
  currentModel: string;
  currentEffort: ModelReasoningEffort;
  availableModels?: CodexModelInfo[];
  setModel: (model: string) => void;
  setEffort: (effort: ModelReasoningEffort) => void;
  testCommand?: string;
  useCodex?: boolean;
}

export interface SlashCommandResult {
  handled: boolean;
  output?: string;
  action?: "quit" | "continue" | "interactive_model" | "interactive_effort";
}

/**
 * Handles /model command.
 */
export function handleModelCommand(args: string[], context: SlashCommandContext): SlashCommandResult {
  const models = context.availableModels ?? loadCachedModels();

  if (args.length === 0) {
    // Show current model and list available models
    const lines: string[] = [];
    lines.push(`Active Model: ${context.currentModel}`);
    lines.push(`Current Effort: ${context.currentEffort}`);
    lines.push("");
    lines.push("Available Models:");

    models.forEach((m, idx) => {
      const isCurrent = m.slug.toLowerCase() === context.currentModel.toLowerCase();
      const marker = isCurrent ? "* " : "  ";
      const currentLabel = isCurrent ? " (active)" : "";
      const numLabel = `[${idx + 1}] `;

      lines.push(`${marker}${numLabel}${m.slug}${currentLabel}`);
      if (m.displayName && m.displayName !== m.slug) {
        lines.push(`     Display Name: ${m.displayName}`);
      }
      if (m.description) {
        lines.push(`     ${m.description}`);
      }
      if (m.supportedReasoningLevels && m.supportedReasoningLevels.length > 0) {
        const levels = m.supportedReasoningLevels.map((l) => l.effort).join(", ");
        lines.push(`     Supported efforts: ${levels}${m.defaultReasoningLevel ? ` (default: ${m.defaultReasoningLevel})` : ""}`);
      } else if (m.defaultReasoningLevel) {
        lines.push(`     Default effort: ${m.defaultReasoningLevel}`);
      }
    });

    lines.push("");
    lines.push("Usage: /model <name|number>");
    lines.push("Example: /model gpt-6-sol   or   /model 2");

    return {
      handled: true,
      output: lines.join("\n"),
      action: "interactive_model",
    };
  }

  const targetArg = args.join(" ").trim();
  const numIndex = parseInt(targetArg, 10);

  let targetModelInfo: CodexModelInfo | undefined;
  let targetSlug: string;

  if (!isNaN(numIndex) && numIndex >= 1 && numIndex <= models.length) {
    targetModelInfo = models[numIndex - 1];
    targetSlug = targetModelInfo.slug;
  } else {
    // Search by slug or display name case-insensitively
    targetModelInfo = models.find(
      (m) =>
        m.slug.toLowerCase() === targetArg.toLowerCase() ||
        m.displayName.toLowerCase() === targetArg.toLowerCase()
    );
    targetSlug = targetModelInfo ? targetModelInfo.slug : targetArg;
  }

  context.setModel(targetSlug);

  const lines: string[] = [];
  if (targetModelInfo) {
    lines.push(`✓ Active model switched to: ${targetSlug} (${targetModelInfo.displayName})`);
    if (targetModelInfo.description) {
      lines.push(`  ${targetModelInfo.description}`);
    }
    if (targetModelInfo.supportedReasoningLevels && targetModelInfo.supportedReasoningLevels.length > 0) {
      const levels = targetModelInfo.supportedReasoningLevels.map((l) => l.effort).join(", ");
      lines.push(`  Supported reasoning efforts: ${levels}`);
      // Check if current effort is supported
      const isEffortSupported = targetModelInfo.supportedReasoningLevels.some(
        (l) => l.effort === context.currentEffort
      );
      if (!isEffortSupported && targetModelInfo.defaultReasoningLevel) {
        lines.push(`  Note: Current effort '${context.currentEffort}' is not in this model's standard list. Default is '${targetModelInfo.defaultReasoningLevel}'. Use '/effort ${targetModelInfo.defaultReasoningLevel}' to align.`);
      }
    }
  } else {
    lines.push(`✓ Active model set to: ${targetSlug} (custom/unlisted model)`);
  }

  return {
    handled: true,
    output: lines.join("\n"),
    action: "continue",
  };
}

/**
 * Handles /effort command.
 */
export function handleEffortCommand(args: string[], context: SlashCommandContext): SlashCommandResult {
  if (args.length === 0) {
    const lines: string[] = [];
    lines.push(`Current Reasoning Effort: ${context.currentEffort}`);
    lines.push(`Active Model: ${context.currentModel}`);
    lines.push("");
    lines.push("Available Reasoning Effort Levels:");

    VALID_REASONING_EFFORTS.forEach((effort, idx) => {
      const isCurrent = effort === context.currentEffort;
      const marker = isCurrent ? "* " : "  ";
      const currentLabel = isCurrent ? " (active)" : "";
      const desc = EFFORT_DESCRIPTIONS[effort] || "";
      const numLabel = `[${idx + 1}] `;

      lines.push(`${marker}${numLabel}${effort.padEnd(11)}${currentLabel} - ${desc}`);
    });

    lines.push("");
    lines.push("Usage: /effort <level|number>");
    lines.push("Example: /effort high   or   /effort 4");

    return {
      handled: true,
      output: lines.join("\n"),
      action: "interactive_effort",
    };
  }

  const targetArg = args[0].trim().toLowerCase();
  const numIndex = parseInt(targetArg, 10);

  let targetEffort: ModelReasoningEffort;

  if (!isNaN(numIndex) && numIndex >= 1 && numIndex <= VALID_REASONING_EFFORTS.length) {
    targetEffort = VALID_REASONING_EFFORTS[numIndex - 1];
  } else if (isValidReasoningEffort(targetArg)) {
    targetEffort = targetArg;
  } else {
    return {
      handled: true,
      output: [
        `Error: Invalid reasoning effort '${targetArg}'.`,
        `Available levels: ${VALID_REASONING_EFFORTS.join(", ")}`,
      ].join("\n"),
      action: "continue",
    };
  }

  context.setEffort(targetEffort);
  const desc = EFFORT_DESCRIPTIONS[targetEffort] || "";

  return {
    handled: true,
    output: `✓ Reasoning effort set to: ${targetEffort} (${desc})`,
    action: "continue",
  };
}

/**
 * Handles /status command.
 */
export function handleStatusCommand(context: SlashCommandContext): SlashCommandResult {
  const models = context.availableModels ?? loadCachedModels();
  const matchedModel = models.find(
    (m) => m.slug.toLowerCase() === context.currentModel.toLowerCase()
  );

  const lines = [
    "=== Harness Configuration Status ===",
    `Active Model:     ${context.currentModel}${matchedModel ? ` (${matchedModel.displayName})` : ""}`,
    `Reasoning Effort: ${context.currentEffort} (${EFFORT_DESCRIPTIONS[context.currentEffort] || "custom"})`,
    `Codex Mode:       ${context.useCodex !== false ? "Enabled" : "Disabled (Offline Simulation)"}`,
    `Test Command:     ${context.testCommand || "npm test"}`,
  ];

  return {
    handled: true,
    output: lines.join("\n"),
    action: "continue",
  };
}

/**
 * Handles /help command.
 */
export function handleHelpCommand(): SlashCommandResult {
  const lines = [
    "Available Commands:",
    "  /model [name|num]    View or switch the active Codex model",
    "  /effort [level|num]  View or change reasoning effort (minimal, low, medium, high, xhigh, max, ultra)",
    "  /status              View current configuration and active settings",
    "  @<file> [prompt]     Load file(s) into context (use Tab to select candidates)",
    "  /help                Display this help message",
    "  /exit, /quit, /q     Exit the harness",
    "",
    "Input Navigation:",
    "  - Enter: submit goal or command",
    "  - Tab: autocomplete and select @file candidates",
    "  - Shift+Enter (or Option+Enter): insert new line",
    "  - Ctrl+D: EOF submit",
  ];

  return {
    handled: true,
    output: lines.join("\n"),
    action: "continue",
  };
}

/**
 * Main dispatcher for slash commands.
 */
export function executeSlashCommand(
  rawInput: string,
  context: SlashCommandContext
): SlashCommandResult {
  const trimmed = rawInput.trim();

  // Handle standalone @ or @help request
  if (trimmed === "@" || trimmed === "@help" || trimmed === "@/help") {
    return {
      handled: true,
      output: [
        "Usage: @<file> [instruction]",
        "Specify file(s) to load into goal context.",
        "Example: @src/main.ts Refactor error handling",
        "Tip: Type '@' and press Tab to interactively browse and select workspace files.",
      ].join("\n"),
      action: "continue",
    };
  }

  if (!trimmed.startsWith("/")) {
    // Check standard exit keywords
    const lower = trimmed.toLowerCase();
    if (lower === "exit" || lower === "quit" || lower === "q") {
      return { handled: true, output: "Exiting harness. Goodbye!", action: "quit" };
    }
    return { handled: false };
  }

  // Parse "/command arg1 arg2 ..."
  const parts = trimmed.slice(1).trim().split(/\s+/);
  const command = parts[0]?.toLowerCase();
  const args = parts.slice(1);

  switch (command) {
    case "model":
    case "models":
      return handleModelCommand(args, context);

    case "effort":
    case "reasoning-effort":
    case "reasoning_effort":
      return handleEffortCommand(args, context);

    case "status":
    case "config":
      return handleStatusCommand(context);

    case "help":
    case "h":
    case "?":
      return handleHelpCommand();

    case "exit":
    case "quit":
    case "q":
      return { handled: true, output: "Exiting harness. Goodbye!", action: "quit" };

    default:
      return {
        handled: true,
        output: `Unknown command: /${command}. Type /help for available commands.`,
        action: "continue",
      };
  }
}
