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
  category?: string;
  defaultReasoningLevel?: ModelReasoningEffort;
  supportedReasoningLevels?: ModelReasoningLevelInfo[];
}

export const CATEGORY_ORDER = [
  "GPT-6 Frontier",
  "o-Series Reasoning",
  "GPT-4o & GPT-4",
  "GPT-5 Series",
  "Specialized",
  "Other Models",
] as const;

export function inferModelCategory(slug: string): string {
  const s = slug.toLowerCase();
  if (s.startsWith("gpt-6") || s === "gpt-reserve") return "GPT-6 Frontier";
  if (s.startsWith("o1") || s.startsWith("o3") || s.startsWith("o4")) return "o-Series Reasoning";
  if (s.startsWith("gpt-4")) return "GPT-4o & GPT-4";
  if (s.startsWith("gpt-5")) return "GPT-5 Series";
  if (s.includes("review") || s.includes("audit")) return "Specialized";
  return "Other Models";
}

export const STANDARD_MODELS: readonly CodexModelInfo[] = [
  // --- GPT-6 Series (Frontier) ---
  {
    slug: "gpt-6-luna",
    displayName: "GPT-6-Luna",
    description: "Fast, balanced reasoning and coding model",
    category: "GPT-6 Frontier",
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
    description: "Workhorse model for coding and everyday work",
    category: "GPT-6 Frontier",
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
    description: "Frontier intelligence for complex engineering & research",
    category: "GPT-6 Frontier",
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
    slug: "gpt-reserve",
    displayName: "GPT-Reserve",
    description: "Fast and affordable agentic coding model",
    category: "GPT-6 Frontier",
    defaultReasoningLevel: "medium",
  },

  // --- o-Series (Reasoning) ---
  {
    slug: "o3-mini",
    displayName: "o3-mini",
    description: "High-speed reasoning model with configurable effort for STEM & code",
    category: "o-Series Reasoning",
    defaultReasoningLevel: "medium",
    supportedReasoningLevels: [
      { effort: "low", description: "Fast responses with lighter reasoning" },
      { effort: "medium", description: "Balances speed and reasoning depth" },
      { effort: "high", description: "Maximum reasoning depth for complex problems" },
    ],
  },
  {
    slug: "o1",
    displayName: "o1",
    description: "Flagship reasoning model for deep thinking and complex STEM/coding",
    category: "o-Series Reasoning",
    defaultReasoningLevel: "medium",
    supportedReasoningLevels: [
      { effort: "low", description: "Fast responses with lighter reasoning" },
      { effort: "medium", description: "Balances speed and reasoning depth" },
      { effort: "high", description: "Maximum reasoning depth for complex problems" },
    ],
  },
  {
    slug: "o1-mini",
    displayName: "o1-mini",
    description: "Fast, cost-efficient reasoning model for code and STEM tasks",
    category: "o-Series Reasoning",
    defaultReasoningLevel: "medium",
    supportedReasoningLevels: [
      { effort: "low", description: "Fast responses with lighter reasoning" },
      { effort: "medium", description: "Balances speed and reasoning depth" },
      { effort: "high", description: "Maximum reasoning depth for complex problems" },
    ],
  },
  {
    slug: "o1-preview",
    displayName: "o1-preview",
    description: "Early preview reasoning model",
    category: "o-Series Reasoning",
    defaultReasoningLevel: "medium",
  },

  // --- GPT-4o & GPT-4 ---
  {
    slug: "gpt-4o",
    displayName: "GPT-4o",
    description: "High-intelligence flagship omni model for multimodal tasks & coding",
    category: "GPT-4o & GPT-4",
  },
  {
    slug: "gpt-4o-mini",
    displayName: "GPT-4o-mini",
    description: "Fast and affordable omni model for lightweight tasks",
    category: "GPT-4o & GPT-4",
  },
  {
    slug: "gpt-4-turbo",
    displayName: "GPT-4-Turbo",
    description: "Advanced GPT-4 Turbo model with vision support",
    category: "GPT-4o & GPT-4",
  },
  {
    slug: "gpt-4",
    displayName: "GPT-4",
    description: "Classic reliable foundation GPT-4 model",
    category: "GPT-4o & GPT-4",
  },

  // --- GPT-5 Series ---
  {
    slug: "gpt-5.6-terra",
    displayName: "GPT-5.6-Terra",
    description: "Compact, balanced model for straightforward work",
    category: "GPT-5 Series",
    defaultReasoningLevel: "medium",
  },
  {
    slug: "gpt-5.6-sol",
    displayName: "GPT-5.6-Sol",
    description: "Coding model for complex work and rapid iteration",
    category: "GPT-5 Series",
    defaultReasoningLevel: "low",
  },
  {
    slug: "gpt-5.6-luna",
    displayName: "GPT-5.6-Luna",
    description: "Fast and efficient coding model",
    category: "GPT-5 Series",
    defaultReasoningLevel: "medium",
  },
  {
    slug: "gpt-5.5",
    displayName: "GPT-5.5",
    description: "Legacy coding model",
    category: "GPT-5 Series",
    defaultReasoningLevel: "medium",
  },

  // --- Specialized ---
  {
    slug: "codex-auto-review",
    displayName: "Codex Auto Review",
    description: "Automatic approval review model for Codex",
    category: "Specialized",
    defaultReasoningLevel: "medium",
  },
];

export const FALLBACK_MODELS: readonly CodexModelInfo[] = STANDARD_MODELS;

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
 * Loads all available models by combining standard known models and cached models from ~/.codex/models_cache.json.
 */
export function loadCachedModels(customPath?: string): CodexModelInfo[] {
  const cachePath =
    customPath ??
    (process.env.HOME ? path.join(process.env.HOME, ".codex", "models_cache.json") : undefined);

  const modelMap = new Map<string, CodexModelInfo>();

  // 1. Initialize with all standard known models
  for (const model of STANDARD_MODELS) {
    modelMap.set(model.slug, { ...model });
  }

  // 2. If cached models exist, merge/overlay them
  if (cachePath && fs.existsSync(cachePath)) {
    try {
      const raw = fs.readFileSync(cachePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.models)) {
        for (const m of parsed.models) {
          const slug = m.slug || m.id;
          if (!slug || typeof slug !== "string") continue;

          const existing = modelMap.get(slug);
          const category = m.category || existing?.category || inferModelCategory(slug);
          const displayName = m.display_name || m.name || existing?.displayName || slug;
          const description = m.description || existing?.description || "";
          const defaultReasoningLevel = (m.default_reasoning_level || existing?.defaultReasoningLevel) as
            | ModelReasoningEffort
            | undefined;
          const supportedReasoningLevels =
            Array.isArray(m.supported_reasoning_levels) && m.supported_reasoning_levels.length > 0
              ? m.supported_reasoning_levels.map((lvl: any) => ({
                  effort: lvl.effort as ModelReasoningEffort,
                  description: lvl.description || "",
                }))
              : existing?.supportedReasoningLevels;

          modelMap.set(slug, {
            slug,
            displayName,
            description,
            category,
            defaultReasoningLevel,
            supportedReasoningLevels,
          });
        }
      }
    } catch {
      // Fallback cleanly to standard models on read/parse error
    }
  }

  // 3. Sort models by canonical category order, then natural model order
  const standardOrderMap = new Map<string, number>();
  STANDARD_MODELS.forEach((m, idx) => {
    standardOrderMap.set(m.slug, idx);
  });

  const allModels = Array.from(modelMap.values());
  allModels.sort((a, b) => {
    const catA = a.category || inferModelCategory(a.slug);
    const catB = b.category || inferModelCategory(b.slug);
    const idxA = (CATEGORY_ORDER as readonly string[]).indexOf(catA);
    const idxB = (CATEGORY_ORDER as readonly string[]).indexOf(catB);
    const orderA = idxA === -1 ? 999 : idxA;
    const orderB = idxB === -1 ? 999 : idxB;
    if (orderA !== orderB) return orderA - orderB;

    const stdIdxA = standardOrderMap.has(a.slug) ? standardOrderMap.get(a.slug)! : 999;
    const stdIdxB = standardOrderMap.has(b.slug) ? standardOrderMap.get(b.slug)! : 999;
    if (stdIdxA !== stdIdxB) return stdIdxA - stdIdxB;

    return a.slug.localeCompare(b.slug);
  });

  return allModels;
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
