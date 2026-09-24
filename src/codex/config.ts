import * as fs from "node:fs";
import * as path from "node:path";
import type { ModelReasoningEffort } from "@openai/codex-sdk";

export const VALID_REASONING_EFFORTS: readonly ModelReasoningEffort[] = [
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
  "persistent",
] as const;

export const EFFORT_DESCRIPTIONS: Record<ModelReasoningEffort, string> = {
  minimal: "Minimal reasoning, fastest response",
  low: "Fast responses with lighter reasoning",
  medium: "Balances speed and reasoning depth for everyday tasks",
  high: "Greater reasoning depth for complex problems",
  xhigh: "Extra high reasoning depth for complex problems",
  max: "Maximum reasoning depth for the hardest problems",
  ultra: "Maximum reasoning with automatic task delegation",
  persistent: "Persistent long-running background reasoning",
};

export interface ModelReasoningLevelInfo {
  effort: ModelReasoningEffort;
  description: string;
}

export interface CodexModelInfo {
  slug: string;
  displayName: string;
  description: string;
  defaultReasoningLevel?: ModelReasoningEffort;
  supportedReasoningLevels?: ModelReasoningLevelInfo[];
}

export const FALLBACK_MODELS: readonly CodexModelInfo[] = [
  {
    slug: "gpt-6-luna",
    displayName: "GPT-6-Luna",
    description: "Balanced reasoning and coding model",
    defaultReasoningLevel: "medium",
    supportedReasoningLevels: [
      { effort: "low", description: "Fast responses with lighter reasoning" },
      { effort: "medium", description: "Balances speed and reasoning depth for everyday tasks" },
      { effort: "high", description: "Greater reasoning depth for complex problems" },
      { effort: "xhigh", description: "Extra high reasoning depth for complex problems" },
      { effort: "max", description: "Maximum reasoning depth for the hardest problems" },
    ],
  },
  {
    slug: "gpt-6-sol",
    displayName: "GPT-6-Sol",
    description: "High-performance coding and reasoning",
    defaultReasoningLevel: "medium",
    supportedReasoningLevels: [
      { effort: "low", description: "Fast responses with lighter reasoning" },
      { effort: "medium", description: "Balances speed and reasoning depth for everyday tasks" },
      { effort: "high", description: "Greater reasoning depth for complex problems" },
      { effort: "xhigh", description: "Extra high reasoning depth for complex problems" },
      { effort: "max", description: "Maximum reasoning depth for the hardest problems" },
      { effort: "ultra", description: "Maximum reasoning with automatic task delegation" },
    ],
  },
  {
    slug: "gpt-6-astra",
    displayName: "GPT-6-Astra",
    description: "Frontier intelligence for complex engineering",
    defaultReasoningLevel: "low",
    supportedReasoningLevels: [
      { effort: "low", description: "Fast responses with lighter reasoning" },
      { effort: "medium", description: "Balances speed and reasoning depth for everyday tasks" },
      { effort: "high", description: "Greater reasoning depth for complex problems" },
      { effort: "xhigh", description: "Extra high reasoning depth for complex problems" },
      { effort: "max", description: "Maximum reasoning depth for the hardest problems" },
      { effort: "ultra", description: "Maximum reasoning with automatic task delegation" },
    ],
  },
  {
    slug: "gpt-5.6-terra",
    displayName: "GPT-5.6-Terra",
    description: "Compact, efficient everyday reasoning",
    defaultReasoningLevel: "medium",
  },
  {
    slug: "gpt-5.6-sol",
    displayName: "GPT-5.6-Sol",
    description: "Optimized for rapid iteration",
    defaultReasoningLevel: "low",
  },
  {
    slug: "gpt-5.6-luna",
    displayName: "GPT-5.6-Luna",
    description: "Balanced coding model",
    defaultReasoningLevel: "medium",
  },
  {
    slug: "gpt-5.5",
    displayName: "GPT-5.5",
    description: "Standard coding model",
    defaultReasoningLevel: "medium",
  },
];

export interface ParsedCodexConfig {
  model?: string;
  model_reasoning_effort?: string;
  [key: string]: any;
}

/**
 * Loads configuration from ~/.codex/config.toml or specified path.
 */
export function loadCodexConfigFile(customPath?: string): ParsedCodexConfig | null {
  const configPath =
    customPath ??
    (process.env.HOME ? path.join(process.env.HOME, ".codex", "config.toml") : undefined);

  if (!configPath || !fs.existsSync(configPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const result: ParsedCodexConfig = {};

    // Simple TOML line parser for string and number values
    const lines = content.split("\n");
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const match = line.match(/^([a-zA-Z0-9_\-]+)\s*=\s*(.+)$/);
      if (match) {
        const key = match[1];
        let valueStr = match[2].trim();

        // Strip inline comments if outside quotes
        if (valueStr.startsWith('"') || valueStr.startsWith("'")) {
          const quote = valueStr[0];
          const endQuoteIdx = valueStr.indexOf(quote, 1);
          if (endQuoteIdx !== -1) {
            valueStr = valueStr.substring(1, endQuoteIdx);
          }
        } else {
          const commentIdx = valueStr.indexOf("#");
          if (commentIdx !== -1) {
            valueStr = valueStr.substring(0, commentIdx).trim();
          }
        }

        result[key] = valueStr;
      }
    }

    return result;
  } catch (err) {
    return null;
  }
}

/**
 * Loads cached models from ~/.codex/models_cache.json or fallback list.
 */
export function loadCachedModels(customPath?: string): CodexModelInfo[] {
  const cachePath =
    customPath ??
    (process.env.HOME ? path.join(process.env.HOME, ".codex", "models_cache.json") : undefined);

  if (!cachePath || !fs.existsSync(cachePath)) {
    return [...FALLBACK_MODELS];
  }

  try {
    const raw = fs.readFileSync(cachePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.models)) {
      return [...FALLBACK_MODELS];
    }

    const models: CodexModelInfo[] = parsed.models.map((m: any) => ({
      slug: m.slug || m.id || "",
      displayName: m.display_name || m.name || m.slug || "",
      description: m.description || "",
      defaultReasoningLevel: m.default_reasoning_level as ModelReasoningEffort | undefined,
      supportedReasoningLevels: Array.isArray(m.supported_reasoning_levels)
        ? m.supported_reasoning_levels.map((lvl: any) => ({
            effort: lvl.effort as ModelReasoningEffort,
            description: lvl.description || "",
          }))
        : undefined,
    })).filter((m: CodexModelInfo) => Boolean(m.slug));

    return models.length > 0 ? models : [...FALLBACK_MODELS];
  } catch {
    return [...FALLBACK_MODELS];
  }
}

/**
 * Resolves the default model respecting options, environment variables, config.toml, and fallbacks.
 */
export function resolveDefaultModel(override?: string, customConfigPath?: string): string {
  if (override && override.trim()) {
    return override.trim();
  }

  if (process.env.CODEX_MODEL && process.env.CODEX_MODEL.trim()) {
    return process.env.CODEX_MODEL.trim();
  }

  if (process.env.OPENAI_MODEL && process.env.OPENAI_MODEL.trim()) {
    return process.env.OPENAI_MODEL.trim();
  }

  const fileConfig = loadCodexConfigFile(customConfigPath);
  if (fileConfig?.model && typeof fileConfig.model === "string" && fileConfig.model.trim()) {
    return fileConfig.model.trim();
  }

  return "gpt-6-luna";
}

/**
 * Resolves the default reasoning effort respecting options, environment variables, config.toml, and fallbacks.
 */
export function resolveDefaultEffort(
  override?: ModelReasoningEffort,
  customConfigPath?: string
): ModelReasoningEffort {
  if (override && isValidReasoningEffort(override)) {
    return override;
  }

  const envEffort =
    process.env.CODEX_REASONING_EFFORT ||
    process.env.CODEX_EFFORT ||
    process.env.OPENAI_REASONING_EFFORT;

  if (envEffort && isValidReasoningEffort(envEffort.trim().toLowerCase())) {
    return envEffort.trim().toLowerCase() as ModelReasoningEffort;
  }

  const fileConfig = loadCodexConfigFile(customConfigPath);
  if (fileConfig?.model_reasoning_effort && isValidReasoningEffort(fileConfig.model_reasoning_effort.trim().toLowerCase())) {
    return fileConfig.model_reasoning_effort.trim().toLowerCase() as ModelReasoningEffort;
  }

  return "high";
}

/**
 * Validates if the given string is a valid reasoning effort level.
 */
export function isValidReasoningEffort(val: unknown): val is ModelReasoningEffort {
  if (typeof val !== "string") return false;
  return (VALID_REASONING_EFFORTS as readonly string[]).includes(val.toLowerCase());
}
