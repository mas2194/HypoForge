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

import * as path from "node:path";
import {
  listWorkspaceFiles,
  findAtToken,
  filterFileCandidates,
  resolveFileMentions,
} from "./codex/file-mention.js";
import { startWebServer } from "./server/server.js";
import { verifyGitEnvironment } from "./git/check.js";
import { verifyCodexAuth } from "./codex/check.js";

interface CandidateCycleState {
  active: boolean;
  tokenStart: number;
  tokenEnd: number;
  originalBuffer: string;
  candidates: string[];
  selectedIndex: number;
}

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

  // Preload workspace files into memory cache in background for instantaneous Tab responses
  listWorkspaceFiles().catch(() => {});

  return new Promise<string>((resolve) => {
    process.stdout.write(promptText);
    let buffer = "";

    let cycleState: CandidateCycleState = {
      active: false,
      tokenStart: 0,
      tokenEnd: 0,
      originalBuffer: "",
      candidates: [],
      selectedIndex: 0,
    };

    readline.emitKeypressEvents(process.stdin);
    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);

    const cleanup = () => {
      process.stdin.removeListener("keypress", onKeypress);
      if (process.stdin.setRawMode) {
        process.stdin.setRawMode(wasRaw ?? false);
      }
    };

    const renderPrompt = (state: CandidateCycleState) => {
      const lastNl = buffer.lastIndexOf("\n");
      const prefix = lastNl === -1 ? "> " : "  ";
      const lineContent = lastNl === -1 ? buffer : buffer.slice(lastNl + 1);

      if (state.active && state.candidates.length > 1) {
        const current = state.selectedIndex;
        const total = state.candidates.length;
        const nextIdx = (current + 1) % total;
        const nextFile = state.candidates[nextIdx];
        const nextLabel = path.basename(nextFile);
        const hint = ` (${current + 1}/${total}: Tab: next -> ${nextLabel} | Space/Enter: done)`;
        process.stdout.write(`\r\x1b[2K${prefix}${lineContent}\x1b[90m${hint}\x1b[0m`);
      } else {
        process.stdout.write(`\r\x1b[2K${prefix}${lineContent}`);
      }
    };

    const isNewlineKey = (str?: string, key?: readline.Key): boolean => {
      if (!key && !str) return false;
      // Shift+Enter (CSI u or shift flag)
      if (key && key.shift && (key.name === "return" || key.name === "enter")) return true;
      if (key && (key.sequence === "\x1b[13;2u" || key.sequence === "\x1b[10;2u")) return true;
      if (str && str.includes("\x1b[27;2;13~")) return true;
      // Option+Enter / Alt+Enter
      if (key && key.meta && (key.name === "return" || key.name === "enter")) return true;
      if (key && (key.sequence === "\x1b\r" || key.sequence === "\x1b\n")) return true;
      if (str === "\x1b\r" || str === "\x1b\n") return true;
      return false;
    };

    const isSubmitKey = (str?: string, key?: readline.Key): boolean => {
      if (!key && !str) return false;
      if (isNewlineKey(str, key)) return false;

      // Regular Enter: \r (0x0D) or \n (0x0A) -> Submit!
      if ((key && key.sequence === "\r") || str === "\r") return true;
      if ((key && key.sequence === "\n") || str === "\n") return true;

      // Universal EOF / submit (Ctrl+D)
      if (key && key.ctrl && key.name === "d") return true;

      // Command+Enter / Super+Enter
      if (key && (key.sequence === "\x1b[13;9u" || key.sequence === "\x1b[10;9u" || key.sequence === "\x1b[13;8u")) return true;
      if (str && (str.includes("\x1b[27;9;13~") || str.includes("\x1b[27;8;13~"))) return true;

      // Ctrl+Enter
      if (key && (key.sequence === "\x1b[13;5u" || key.sequence === "\x1b[10;5u")) return true;
      if (str && str.includes("\x1b[27;5;13~")) return true;
      if (key && key.ctrl && (key.name === "return" || key.name === "enter" || key.name === "j")) return true;

      return false;
    };

    const onKeypress = async (str: string | undefined, key: readline.Key | undefined) => {
      // Handle Ctrl+C (SIGINT)
      if (key && key.ctrl && key.name === "c") {
        cleanup();
        process.stdout.write("\n");
        process.exit(0);
      }

      // Handle Tab key for @ file completion & in-place candidate cycling
      const isTab = (key && key.name === "tab") || (key && key.sequence === "\t") || str === "\t";
      if (isTab) {
        if (cycleState.active) {
          // Cycle through candidate items in place on the same line
          if (key && key.shift) {
            cycleState.selectedIndex =
              (cycleState.selectedIndex - 1 + cycleState.candidates.length) %
              cycleState.candidates.length;
          } else {
            cycleState.selectedIndex =
              (cycleState.selectedIndex + 1) % cycleState.candidates.length;
          }

          const selectedFile = cycleState.candidates[cycleState.selectedIndex];
          buffer =
            buffer.slice(0, cycleState.tokenStart) +
            `@${selectedFile}` +
            buffer.slice(cycleState.tokenEnd);
          cycleState.tokenEnd = cycleState.tokenStart + 1 + selectedFile.length;

          renderPrompt(cycleState);
          return;
        }

        // Search for @ mention token under/before cursor
        const token = findAtToken(buffer);
        if (token) {
          const workspaceFiles = await listWorkspaceFiles();
          const candidates = filterFileCandidates(token.query, workspaceFiles);

          if (candidates.length === 0) {
            process.stdout.write("\x07"); // Beep / audible bell
            return;
          }

          if (candidates.length === 1) {
            // Exactly 1 match: complete immediately with trailing space
            const single = candidates[0];
            buffer =
              buffer.slice(0, token.start) +
              `@${single} ` +
              buffer.slice(token.end);

            renderPrompt(cycleState);
            return;
          }

          // Multiple candidates: activate cycle state on current line
          const first = candidates[0];
          cycleState = {
            active: true,
            tokenStart: token.start,
            tokenEnd: token.start + 1 + first.length,
            originalBuffer: buffer,
            candidates,
            selectedIndex: 0,
          };

          buffer =
            buffer.slice(0, token.start) +
            `@${first}` +
            buffer.slice(token.end);

          renderPrompt(cycleState);
          return;
        }

        return;
      }

      // Arrow navigation while cycling candidates
      if (cycleState.active && key && (key.name === "down" || key.name === "up")) {
        if (key.name === "down") {
          cycleState.selectedIndex =
            (cycleState.selectedIndex + 1) % cycleState.candidates.length;
        } else {
          cycleState.selectedIndex =
            (cycleState.selectedIndex - 1 + cycleState.candidates.length) %
            cycleState.candidates.length;
        }

        const selectedFile = cycleState.candidates[cycleState.selectedIndex];
        buffer =
          buffer.slice(0, cycleState.tokenStart) +
          `@${selectedFile}` +
          buffer.slice(cycleState.tokenEnd);
        cycleState.tokenEnd = cycleState.tokenStart + 1 + selectedFile.length;

        renderPrompt(cycleState);
        return;
      }

      // Escape key cancels candidate cycling and restores original text
      if (cycleState.active && key && key.name === "escape") {
        buffer = cycleState.originalBuffer;
        cycleState.active = false;
        renderPrompt(cycleState);
        return;
      }

      // Space confirms candidate selection and adds a space
      if (cycleState.active && str === " ") {
        cycleState.active = false;
        buffer =
          buffer.slice(0, cycleState.tokenEnd) +
          " " +
          buffer.slice(cycleState.tokenEnd);
        renderPrompt(cycleState);
        return;
      }

      // Handle multi-character paste
      if (str && str.length > 1 && !str.startsWith("\x1b")) {
        if (cycleState.active) {
          cycleState.active = false;
        }
        const normalized = str.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        buffer += normalized;
        renderPrompt(cycleState);
        return;
      }

      // Submit input on Enter / Ctrl+Enter / Ctrl+D
      if (isSubmitKey(str, key)) {
        if (cycleState.active) {
          cycleState.active = false;
          renderPrompt(cycleState);
        }
        cleanup();
        process.stdout.write("\n");
        resolve(buffer);
        return;
      }

      // Insert newline on regular Enter / Shift+Enter
      if (isNewlineKey(str, key)) {
        if (cycleState.active) {
          cycleState.active = false;
          renderPrompt(cycleState);
        }
        buffer += "\n";
        process.stdout.write("\n");
        return;
      }

      // Handle Backspace
      if (
        key &&
        (key.name === "backspace" || key.sequence === "\x7f" || key.sequence === "\b")
      ) {
        if (cycleState.active) {
          buffer = cycleState.originalBuffer;
          cycleState.active = false;
          if (buffer.length > 0) {
            buffer = buffer.slice(0, -1);
          }
          renderPrompt(cycleState);
          return;
        }

        if (buffer.length > 0) {
          buffer = buffer.slice(0, -1);
          renderPrompt(cycleState);
        }
        return;
      }

      // Append printable characters
      if (str && (!key || (!key.ctrl && !key.meta))) {
        if (cycleState.active) {
          cycleState.active = false;
        }
        buffer += str;
        renderPrompt(cycleState);
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
  const displayGoal = goal.split("\n\n---")[0].trim();
  console.log(`\nTarget Goal: "${displayGoal}"`);
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
    testCommand: process.env.HARNESS_TEST_COMMAND,
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
 * Parses CLI arguments for flags (--model, -m, --effort, -e, --server, -s, --port, -p) and extracts the remaining goal.
 */
export function parseCliArgs(args: string[]): {
  model?: string;
  effort?: ModelReasoningEffort;
  goal?: string;
  server?: boolean;
  port?: number;
} {
  let model: string | undefined;
  let effort: ModelReasoningEffort | undefined;
  let server = false;
  let port: number | undefined;
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
    } else if (arg === "--server" || arg === "-s") {
      server = true;
    } else if (arg === "--port" || arg === "-p") {
      if (i + 1 < args.length) {
        port = parseInt(args[++i], 10);
      }
    } else {
      remaining.push(arg);
    }
  }

  const goal = remaining.join(" ").trim();
  return { model, effort, goal: goal || undefined, server, port };
}

export async function main() {
  console.log("=== RefuteFlow (rf) Starting ===");
  console.log("Mode: Evidence-based Architecture Exploration (MVP)");

  await verifyGitEnvironment();
  await verifyCodexAuth();

  const cliParsed = parseCliArgs(process.argv.slice(2));

  let currentModel = resolveDefaultModel(cliParsed.model);
  let currentEffort = resolveDefaultEffort(cliParsed.effort);
  const availableModels = loadCachedModels();

  // If launched with --server or -s, start the Web UI Server
  if (cliParsed.server) {
    const port = cliParsed.port ?? (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);
    const serverInstance = await startWebServer({
      port,
      model: currentModel,
      effort: currentEffort,
    });

    console.log("============================================================");
    console.log(`  🌐 Web UI Server Running at: http://localhost:${serverInstance.port}`);
    console.log(`  Active Model: ${currentModel} | Reasoning Effort: ${currentEffort}`);
    console.log("  Open the URL above in your browser to interact with the harness.");
    console.log("  Press Ctrl+C to stop the server.");
    console.log("============================================================");

    process.on("SIGINT", async () => {
      console.log("\nShutting down web server...");
      await serverInstance.close();
      process.exit(0);
    });
    return;
  }

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
    testCommand: process.env.HARNESS_TEST_COMMAND,
    useCodex:
      process.env.USE_CODEX !== undefined
        ? process.env.USE_CODEX !== "false" && process.env.USE_CODEX !== "0"
        : true,
  });

  // If a goal or command was passed via CLI argument
  if (cliParsed.goal) {
    if (cliParsed.goal.startsWith("/") || cliParsed.goal === "@" || cliParsed.goal === "@help") {
      const res = executeSlashCommand(cliParsed.goal, getSlashContext());
      if (res.output) {
        console.log(res.output);
      }
      return;
    }
    try {
      const resolution = await resolveFileMentions(cliParsed.goal);
      if (resolution.files.length > 0) {
        const fileNames = resolution.files.map((f) => f.path).join(", ");
        console.log(`✓ Loaded ${resolution.files.length} file(s): ${fileNames}`);
      }
      await runHarness(resolution.expandedPrompt, { model: currentModel, effort: currentEffort });
    } catch (err: any) {
      console.error(`Fatal error loading specified file(s): ${err.message}`);
      process.exit(1);
    }
    return;
  }

  console.log(`Active Model: ${currentModel} | Reasoning Effort: ${currentEffort}`);
  console.log("Tip: Use /model or /effort to configure, @<file> to load files, /help for all commands\n");

  // Interactive mode: wait for user instruction with multi-line support
  while (true) {
    const answer = await promptUserInstruction(
      "Enter goal or command (Enter: submit | Tab: complete @file | Shift+Enter: newline | '/help': commands):\n> "
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
      const resolution = await resolveFileMentions(trimmed);
      if (resolution.files.length > 0) {
        const fileNames = resolution.files.map((f) => f.path).join(", ");
        console.log(`\n✓ Loaded ${resolution.files.length} file(s): ${fileNames}`);
      }
      await runHarness(resolution.expandedPrompt, { model: currentModel, effort: currentEffort });
    } catch (err: any) {
      console.error(`\nError loading specified file(s): ${err.message}\n`);
    }

    console.log("\n" + "-".repeat(50) + "\n");
  }
}

// Only invoke main when run directly as CLI entrypoint (and not when imported by bin.ts)
const isDirectRun =
  Boolean(process.argv[1]) &&
  (process.argv[1].endsWith("src/main.ts") ||
    process.argv[1].endsWith("dist/main.js"));

if (isDirectRun) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
