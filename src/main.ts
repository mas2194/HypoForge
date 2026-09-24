import "dotenv/config";
import * as readline from "node:readline";
import * as readlinePromises from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { ModelReasoningEffort } from "@openai/codex-sdk";
import { HarnessStateMachine } from "./orchestrator/state-machine.js";
import {
  resolveDefaultModel,
  resolveDefaultEffort,
  loadCachedModels,
} from "./codex/config.js";
import {
  executeSlashCommand,
  type SlashCommandContext,
} from "./codex/commands.js";

async function promptUserInstruction(promptText: string): Promise<string> {
  if (!process.stdin.isTTY) {
    // Non-interactive fallback (e.g. piped stdin)
    const rl = readlinePromises.createInterface({ input, output });
    try {
      return await rl.question(promptText);
    } finally {
      rl.close();
    }
  }

  return new Promise<string>((resolve) => {
    process.stdout.write(promptText);
    let buffer = "";

    readline.emitKeypressEvents(process.stdin);
    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);

    const cleanup = () => {
      process.stdin.removeListener("keypress", onKeypress);
      if (process.stdin.setRawMode) {
        process.stdin.setRawMode(wasRaw ?? false);
      }
    };

    const isSubmitKey = (str?: string, key?: readline.Key): boolean => {
      if (!key && !str) return false;
      // Ctrl+D
      if (key && key.ctrl && key.name === "d") return true;
      // CSI u Ctrl+Enter: \x1b[13;5u or \x1b[10;5u
      if (key && (key.sequence === "\x1b[13;5u" || key.sequence === "\x1b[10;5u")) return true;
      // XTerm modifyOtherKeys
      if (str && str.includes("\x1b[27;5;13~")) return true;
      // Explicit Ctrl flag with return/enter/j
      if (key && key.ctrl && (key.name === "return" || key.name === "enter" || key.name === "j")) return true;
      // Terminal.app & standard TTY sends \n (0x0A) for Ctrl+Enter / Ctrl+J
      if ((key && key.sequence === "\n") || str === "\n") return true;
      return false;
    };

    const isNewlineKey = (str?: string, key?: readline.Key): boolean => {
      if (isSubmitKey(str, key)) return false;
      // Normal Enter key in raw mode sends \r (0x0D)
      if ((key && key.sequence === "\r") || str === "\r") return true;
      return false;
    };

    const onKeypress = (str: string | undefined, key: readline.Key | undefined) => {
      // Handle Ctrl+C (SIGINT)
      if (key && key.ctrl && key.name === "c") {
        cleanup();
        process.stdout.write("\n");
        process.exit(0);
      }

      // Handle multi-character paste
      if (str && str.length > 1 && !str.startsWith("\x1b")) {
        const normalized = str.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        buffer += normalized;
        process.stdout.write(normalized);
        return;
      }

      // Submit input on Ctrl+Enter / Ctrl+D
      if (isSubmitKey(str, key)) {
        cleanup();
        process.stdout.write("\n");
        resolve(buffer);
        return;
      }

      // Insert newline on regular Enter
      if (isNewlineKey(str, key)) {
        buffer += "\n";
        process.stdout.write("\n");
        return;
      }

      // Handle Backspace
      if (key && (key.name === "backspace" || key.sequence === "\x7f" || key.sequence === "\b")) {
        if (buffer.length > 0) {
          const removed = buffer[buffer.length - 1];
          buffer = buffer.slice(0, -1);
          if (removed === "\n") {
            process.stdout.write("\x1b[1A\x1b[999C");
          } else {
            process.stdout.write("\b \b");
          }
        }
        return;
      }

      // Append printable characters
      if (str && (!key || (!key.ctrl && !key.meta))) {
        buffer += str;
        process.stdout.write(str);
      }
    };

    process.stdin.on("keypress", onKeypress);
  });
}

export interface RunHarnessOptions {
  model: string;
  effort: ModelReasoningEffort;
}

export async function runHarness(goal: string, options: RunHarnessOptions) {
  console.log(`\nTarget Goal: "${goal}"`);
  console.log(`Active Model: ${options.model} | Reasoning Effort: ${options.effort}\n`);

  // Support USE_CODEX=false to explicitly disable. Default to true (supporting ChatGPT OAuth and API keys).
  const useCodex =
    process.env.USE_CODEX !== undefined
      ? process.env.USE_CODEX !== "false" && process.env.USE_CODEX !== "0"
      : true;

  const harness = new HarnessStateMachine({
    goal,
    useCodex,
    codexModel: options.model,
    codexModelReasoningEffort: options.effort,
    testCommand: process.env.HARNESS_TEST_COMMAND || "npm test",
  });

  const finalState = await harness.runUntilFinished();

  console.log("\n=== Execution Summary ===");
  console.log(`Final Phase: ${finalState.phase}`);
  if (finalState.winner) {
    console.log(`Winning Candidate: ${finalState.winner.implementation.candidateId}`);
    console.log(`Intervention Level: ${finalState.winner.implementation.level}`);
    console.log(`Final Evidence Score: ${finalState.winner.verification.score.toFixed(2)}`);
  } else {
    console.log("No winning candidate integrated.");
  }
}

/**
 * Parses CLI arguments for flags (--model, -m, --effort, -e) and extracts the remaining goal.
 */
export function parseCliArgs(args: string[]): {
  model?: string;
  effort?: ModelReasoningEffort;
  goal?: string;
} {
  let model: string | undefined;
  let effort: ModelReasoningEffort | undefined;
  const remaining: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--model" || arg === "-m") {
      if (i + 1 < args.length) {
        model = args[++i];
      }
    } else if (arg === "--effort" || arg === "-e") {
      if (i + 1 < args.length) {
        effort = args[++i] as ModelReasoningEffort;
      }
    } else {
      remaining.push(arg);
    }
  }

  const goal = remaining.join(" ").trim();
  return { model, effort, goal: goal || undefined };
}

async function main() {
  console.log("=== Autonomous Agent Harness Starting ===");
  console.log("Mode: Evidence-based Architecture Exploration (MVP)");

  const cliParsed = parseCliArgs(process.argv.slice(2));

  let currentModel = resolveDefaultModel(cliParsed.model);
  let currentEffort = resolveDefaultEffort(cliParsed.effort);
  const availableModels = loadCachedModels();

  const getSlashContext = (): SlashCommandContext => ({
    currentModel,
    currentEffort,
    availableModels,
    setModel: (m: string) => {
      currentModel = m;
    },
    setEffort: (e: ModelReasoningEffort) => {
      currentEffort = e;
    },
    testCommand: process.env.HARNESS_TEST_COMMAND || "npm test",
    useCodex:
      process.env.USE_CODEX !== undefined
        ? process.env.USE_CODEX !== "false" && process.env.USE_CODEX !== "0"
        : true,
  });

  // If a goal or command was passed via CLI argument
  if (cliParsed.goal) {
    if (cliParsed.goal.startsWith("/")) {
      const res = executeSlashCommand(cliParsed.goal, getSlashContext());
      if (res.output) {
        console.log(res.output);
      }
      return;
    }
    await runHarness(cliParsed.goal, { model: currentModel, effort: currentEffort });
    return;
  }

  console.log(`Active Model: ${currentModel} | Reasoning Effort: ${currentEffort}`);
  console.log("Tip: Use /model or /effort to configure, /help for all commands\n");

  // Interactive mode: wait for user instruction with multi-line support
  while (true) {
    const answer = await promptUserInstruction(
      "Enter goal or command (Enter: newline | Ctrl+Enter or Ctrl+D: submit | '/exit': quit | '/help': commands):\n> "
    );
    const trimmed = answer.trim();

    if (!trimmed) {
      continue;
    }

    const slashContext = getSlashContext();
    const commandResult = executeSlashCommand(trimmed, slashContext);

    if (commandResult.handled) {
      if (commandResult.output) {
        console.log("\n" + commandResult.output + "\n");
      }

      if (commandResult.action === "quit") {
        break;
      }

      // Handle interactive selection if bare /model was invoked
      if (commandResult.action === "interactive_model") {
        const choice = await promptUserInstruction(
          "Select model by number or name (press Enter to cancel):\n> "
        );
        const choiceTrimmed = choice.trim();
        if (choiceTrimmed) {
          const subRes = executeSlashCommand(`/model ${choiceTrimmed}`, slashContext);
          if (subRes.output) {
            console.log("\n" + subRes.output + "\n");
          }
        }
      }

      // Handle interactive selection if bare /effort was invoked
      if (commandResult.action === "interactive_effort") {
        const choice = await promptUserInstruction(
          "Select reasoning effort by number or level (press Enter to cancel):\n> "
        );
        const choiceTrimmed = choice.trim();
        if (choiceTrimmed) {
          const subRes = executeSlashCommand(`/effort ${choiceTrimmed}`, slashContext);
          if (subRes.output) {
            console.log("\n" + subRes.output + "\n");
          }
        }
      }

      console.log("-".repeat(50) + "\n");
      continue;
    }

    try {
      await runHarness(trimmed, { model: currentModel, effort: currentEffort });
    } catch (err) {
      console.error("Error during execution:", err);
    }

    console.log("\n" + "-".repeat(50) + "\n");
  }
}

// Only invoke main when run directly as CLI entrypoint
const isDirectRun =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("src/main.ts") ||
  process.argv[1]?.endsWith("dist/main.js");

if (isDirectRun) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
