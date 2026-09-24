import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { ModelReasoningEffort } from "@openai/codex-sdk";
import {
  resolveDefaultModel,
  resolveDefaultEffort,
  loadCodexConfigFile,
  loadCachedModels,
  isValidReasoningEffort,
  VALID_REASONING_EFFORTS,
  FALLBACK_MODELS,
} from "../src/codex/config.js";
import {
  executeSlashCommand,
  handleModelCommand,
  handleEffortCommand,
  handleStatusCommand,
  handleHelpCommand,
  type SlashCommandContext,
} from "../src/codex/commands.js";
import { parseCliArgs } from "../src/main.js";
import { CodexClientManager } from "../src/codex/client.js";
import { HarnessOrchestrator } from "../src/orchestrator/orchestrator.js";

describe("Codex Configuration & Resolution", () => {
  const originalEnv = { ...process.env };
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-test-"));
    delete process.env.CODEX_MODEL;
    delete process.env.OPENAI_MODEL;
    delete process.env.CODEX_REASONING_EFFORT;
    delete process.env.CODEX_EFFORT;
    delete process.env.OPENAI_REASONING_EFFORT;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("resolves default model from options, env vars, config, or fallback", () => {
    // 1. Fallback
    expect(resolveDefaultModel()).toBe("gpt-6-luna");

    // 2. Config file
    const fakeConfigPath = path.join(tempDir, "config.toml");
    fs.writeFileSync(fakeConfigPath, 'model = "gpt-5.6-terra"\n');
    expect(resolveDefaultModel(undefined, fakeConfigPath)).toBe("gpt-5.6-terra");

    // 3. OPENAI_MODEL
    process.env.OPENAI_MODEL = "gpt-5.5";
    expect(resolveDefaultModel(undefined, fakeConfigPath)).toBe("gpt-5.5");

    // 4. CODEX_MODEL
    process.env.CODEX_MODEL = "gpt-6-astra";
    expect(resolveDefaultModel(undefined, fakeConfigPath)).toBe("gpt-6-astra");

    // 5. Explicit override
    expect(resolveDefaultModel("gpt-6-sol", fakeConfigPath)).toBe("gpt-6-sol");
  });

  it("resolves default effort from options, env vars, config, or fallback", () => {
    // 1. Fallback
    expect(resolveDefaultEffort()).toBe("high");

    // 2. Config file
    const fakeConfigPath = path.join(tempDir, "config.toml");
    fs.writeFileSync(fakeConfigPath, 'model_reasoning_effort = "medium"\n');
    expect(resolveDefaultEffort(undefined, fakeConfigPath)).toBe("medium");

    // 3. OPENAI_REASONING_EFFORT
    process.env.OPENAI_REASONING_EFFORT = "low";
    expect(resolveDefaultEffort(undefined, fakeConfigPath)).toBe("low");

    // 4. CODEX_REASONING_EFFORT
    process.env.CODEX_REASONING_EFFORT = "xhigh";
    expect(resolveDefaultEffort(undefined, fakeConfigPath)).toBe("xhigh");

    // 5. Explicit override
    expect(resolveDefaultEffort("max", fakeConfigPath)).toBe("max");
  });

  it("validates valid reasoning efforts correctly", () => {
    expect(isValidReasoningEffort("low")).toBe(true);
    expect(isValidReasoningEffort("high")).toBe(true);
    expect(isValidReasoningEffort("xhigh")).toBe(true);
    expect(isValidReasoningEffort("ultra")).toBe(true);
    expect(isValidReasoningEffort("invalid-effort")).toBe(false);
    expect(isValidReasoningEffort(123)).toBe(false);
  });

  it("loads models from cache or falls back gracefully", () => {
    const fakeCachePath = path.join(tempDir, "models_cache.json");
    fs.writeFileSync(
      fakeCachePath,
      JSON.stringify({
        models: [
          {
            slug: "custom-test-model",
            display_name: "Custom Test Model",
            description: "A model for testing",
            default_reasoning_level: "low",
            supported_reasoning_levels: [{ effort: "low", description: "Fast" }],
          },
        ],
      })
    );

    const loaded = loadCachedModels(fakeCachePath);
    expect(loaded.some((m) => m.slug === "custom-test-model")).toBe(true);
    const custom = loaded.find((m) => m.slug === "custom-test-model")!;
    expect(custom.displayName).toBe("Custom Test Model");
    expect(custom.defaultReasoningLevel).toBe("low");
    expect(loaded.some((m) => m.slug === "gpt-6-luna")).toBe(true);
    expect(loaded.some((m) => m.slug === "o3-mini")).toBe(true);

    // Non-existent cache falls back to built-ins
    const fallback = loadCachedModels(path.join(tempDir, "non_existent.json"));
    expect(fallback.length).toBeGreaterThan(0);
    expect(fallback.some((m) => m.slug === "gpt-6-luna")).toBe(true);
  });
});

describe("/model and /effort Slash Commands", () => {
  let context: SlashCommandContext;
  let activeModel = "gpt-6-luna";
  let activeEffort: ModelReasoningEffort = "high";

  beforeEach(() => {
    activeModel = "gpt-6-luna";
    activeEffort = "high";
    context = {
      currentModel: activeModel,
      currentEffort: activeEffort,
      availableModels: [...FALLBACK_MODELS],
      setModel: (m) => {
        activeModel = m;
        context.currentModel = m;
      },
      setEffort: (e) => {
        activeEffort = e;
        context.currentEffort = e;
      },
      testCommand: "npm test",
      useCodex: true,
    };
  });

  it("lists available models when /model is called with no arguments", () => {
    const res = handleModelCommand([], context);
    expect(res.handled).toBe(true);
    expect(res.action).toBe("interactive_model");
    expect(res.output).toContain("Active Model: gpt-6-luna");
    expect(res.output).toContain("Available Models:");
    expect(res.output).toContain("gpt-6-luna (active)");
    expect(res.output).toContain("gpt-6-sol");
    expect(res.output).toContain("Usage: /model <name|number>");
  });

  it("switches model by slug with /model <slug>", () => {
    const res = handleModelCommand(["gpt-6-sol"], context);
    expect(res.handled).toBe(true);
    expect(res.action).toBe("continue");
    expect(activeModel).toBe("gpt-6-sol");
    expect(res.output).toContain("Active model switched to: gpt-6-sol (GPT-6-Sol)");
  });

  it("switches model by index with /model <number>", () => {
    // Index 2 is gpt-6-sol in fallback list
    const res = handleModelCommand(["2"], context);
    expect(res.handled).toBe(true);
    expect(activeModel).toBe("gpt-6-sol");
    expect(res.output).toContain("Active model switched to: gpt-6-sol");
  });

  it("allows setting custom/unlisted model names", () => {
    const res = handleModelCommand(["ft:gpt-4o-custom"], context);
    expect(res.handled).toBe(true);
    expect(activeModel).toBe("ft:gpt-4o-custom");
    expect(res.output).toContain("Active model set to: ft:gpt-4o-custom (custom/unlisted model)");
  });

  it("lists available reasoning effort levels when /effort is called with no arguments", () => {
    const res = handleEffortCommand([], context);
    expect(res.handled).toBe(true);
    expect(res.action).toBe("interactive_effort");
    expect(res.output).toContain("Current Reasoning Effort: high");
    expect(res.output).toContain("high        (active)");
    expect(res.output).toContain("low");
    expect(res.output).toContain("medium");
    expect(res.output).toContain("Usage: /effort <level|number>");
  });

  it("switches reasoning effort by level name with /effort <level>", () => {
    const res = handleEffortCommand(["low"], context);
    expect(res.handled).toBe(true);
    expect(activeEffort).toBe("low");
    expect(res.output).toContain("Reasoning effort set to: low");
  });

  it("switches reasoning effort by index with /effort <number>", () => {
    // In VALID_REASONING_EFFORTS: 1 is minimal, 2 is low, 3 is medium, 4 is high, etc.
    const res = handleEffortCommand(["3"], context);
    expect(res.handled).toBe(true);
    expect(activeEffort).toBe("medium");
    expect(res.output).toContain("Reasoning effort set to: medium");
  });

  it("rejects invalid reasoning effort levels with an error message", () => {
    const res = handleEffortCommand(["extreme"], context);
    expect(res.handled).toBe(true);
    expect(activeEffort).toBe("high"); // Unchanged
    expect(res.output).toContain("Error: Invalid reasoning effort 'extreme'");
    expect(res.output).toContain("Available levels:");
  });

  it("handles /status and /help commands", () => {
    const statusRes = handleStatusCommand(context);
    expect(statusRes.output).toContain("=== Harness Configuration Status ===");
    expect(statusRes.output).toContain("Active Model:     gpt-6-luna");
    expect(statusRes.output).toContain("Reasoning Effort: high");

    const helpRes = handleHelpCommand();
    expect(helpRes.output).toContain("/model [name|num]");
    expect(helpRes.output).toContain("/effort [level|num]");
    expect(helpRes.output).toContain("/status");
    expect(helpRes.output).toContain("/exit, /quit, /q");
    expect(helpRes.output).toContain("Enter: submit goal or command");
  });

  it("dispatches commands via executeSlashCommand", () => {
    // Normal prompt -> not handled
    const promptRes = executeSlashCommand("Implement user authentication", context);
    expect(promptRes.handled).toBe(false);

    // /model command
    const modelRes = executeSlashCommand("/model gpt-6-astra", context);
    expect(modelRes.handled).toBe(true);
    expect(activeModel).toBe("gpt-6-astra");

    // /effort command
    const effortRes = executeSlashCommand("/effort xhigh", context);
    expect(effortRes.handled).toBe(true);
    expect(activeEffort).toBe("xhigh");

    // exit commands (/exit, /quit, /q, exit)
    expect(executeSlashCommand("/exit", context).action).toBe("quit");
    expect(executeSlashCommand("/quit", context).action).toBe("quit");
    expect(executeSlashCommand("/q", context).action).toBe("quit");
    expect(executeSlashCommand("exit", context).action).toBe("quit");
    expect(executeSlashCommand("quit", context).action).toBe("quit");
    expect(executeSlashCommand("q", context).action).toBe("quit");

    // unknown slash command
    const unknownRes = executeSlashCommand("/unknown", context);
    expect(unknownRes.handled).toBe(true);
    expect(unknownRes.output).toContain("Unknown command: /unknown");
  });
});

describe("CLI Argument Parsing", () => {
  it("parses --model, -m, --effort, -e and goal correctly", () => {
    const parsed1 = parseCliArgs(["--model", "gpt-6-sol", "--effort", "high", "Fix", "test", "issue"]);
    expect(parsed1.model).toBe("gpt-6-sol");
    expect(parsed1.effort).toBe("high");
    expect(parsed1.goal).toBe("Fix test issue");

    const parsed2 = parseCliArgs(["-m", "gpt-5.6-terra", "-e", "low"]);
    expect(parsed2.model).toBe("gpt-5.6-terra");
    expect(parsed2.effort).toBe("low");
    expect(parsed2.goal).toBeUndefined();

    const parsed3 = parseCliArgs(["/model"]);
    expect(parsed3.goal).toBe("/model");
  });
});

describe("CodexClientManager & Orchestrator Integration", () => {
  it("manages defaultModel and defaultModelReasoningEffort with dynamic setters", () => {
    const manager = new CodexClientManager({
      defaultModel: "gpt-6-luna",
      defaultModelReasoningEffort: "medium",
    });

    expect(manager.defaultModel).toBe("gpt-6-luna");
    expect(manager.defaultModelReasoningEffort).toBe("medium");

    manager.setModel("gpt-6-sol");
    expect(manager.defaultModel).toBe("gpt-6-sol");

    manager.setReasoningEffort("high");
    expect(manager.defaultModelReasoningEffort).toBe("high");
  });

  it("passes modelReasoningEffort to startThread", () => {
    const manager = new CodexClientManager({
      defaultModel: "gpt-6-luna",
      defaultModelReasoningEffort: "xhigh",
    });

    // Spy on codex.startThread
    const startThreadSpy = vi.spyOn((manager as any).codex, "startThread").mockReturnValue({} as any);

    manager.startWorkerThread({
      workingDirectory: "/tmp/fake-dir",
    });

    expect(startThreadSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-6-luna",
        modelReasoningEffort: "xhigh",
        workingDirectory: "/tmp/fake-dir",
      })
    );
  });

  it("passes codexModelReasoningEffort through HarnessOrchestrator options", () => {
    const orchestrator = new HarnessOrchestrator({
      goal: "Test orchestrator with model effort",
      useCodex: true,
      codexModel: "gpt-6-sol",
      codexModelReasoningEffort: "max",
    });

    expect(orchestrator.context.codexManager?.defaultModel).toBe("gpt-6-sol");
    expect(orchestrator.context.codexManager?.defaultModelReasoningEffort).toBe("max");
  });
});
