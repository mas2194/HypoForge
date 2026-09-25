import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CodexAuthCheckResult {
  isCodexEnabled: boolean;
  isCodexInstalled: boolean;
  isLoggedIn: boolean;
  authMethod?: string;
  message?: string;
}

export type ExecFileFunction = (
  file: string,
  args: string[],
  options?: { cwd?: string; env?: NodeJS.ProcessEnv }
) => Promise<{ stdout: string; stderr: string }>;

export interface VerifyCodexAuthOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  logger?: (message: string) => void;
  execFn?: ExecFileFunction;
}

/**
 * Checks if Codex CLI is installed and whether the user is authenticated.
 */
export async function checkCodexAuth(options: VerifyCodexAuthOptions = {}): Promise<CodexAuthCheckResult> {
  const env = options.env ?? process.env;
  const exec = options.execFn ?? (execFileAsync as unknown as ExecFileFunction);

  // Check if Codex is explicitly disabled
  const useCodex =
    env.USE_CODEX !== undefined
      ? env.USE_CODEX !== "false" && env.USE_CODEX !== "0"
      : true;

  if (!useCodex) {
    return {
      isCodexEnabled: false,
      isCodexInstalled: true,
      isLoggedIn: true,
    };
  }

  // 1. Try running `codex login status`
  try {
    const { stdout, stderr } = await exec("codex", ["login", "status"], {
      cwd: options.cwd ?? process.cwd(),
      env,
    });
    const output = (stdout + "\n" + stderr).trim();
    if (output.toLowerCase().includes("logged in")) {
      return {
        isCodexEnabled: true,
        isCodexInstalled: true,
        isLoggedIn: true,
        authMethod: output,
      };
    }
  } catch (err: any) {
    if (err.code === "ENOENT" || err.message?.includes("ENOENT")) {
      // Codex CLI is not installed / not found in PATH
      const hasApiKey = Boolean(env.OPENAI_API_KEY && env.OPENAI_API_KEY.trim());
      return {
        isCodexEnabled: true,
        isCodexInstalled: false,
        isLoggedIn: hasApiKey,
        message:
          "============================================================\n" +
          "⚠️  [Codex] codex コマンドが見つかりません。\n" +
          "    HypoForge の推論実行には Codex CLI (@openai/codex) が必要です。\n" +
          "    Codex CLI をインストールし、'codex login' でログインしてください。\n" +
          "    (Codex CLI not found. Please install it and run 'codex login'.)\n" +
          "============================================================",
      };
    }
    // Command failed (e.g. exit code 1 with "Not logged in")
  }

  // 2. Check if OPENAI_API_KEY is provided as fallback
  if (env.OPENAI_API_KEY && env.OPENAI_API_KEY.trim()) {
    return {
      isCodexEnabled: true,
      isCodexInstalled: true,
      isLoggedIn: true,
      authMethod: "OPENAI_API_KEY",
    };
  }

  // 3. Not logged in and no API key
  return {
    isCodexEnabled: true,
    isCodexInstalled: true,
    isLoggedIn: false,
    message:
      "============================================================\n" +
      "⚠️  [Codex] Codex にログインしていません。\n" +
      "    HypoForge を使用するには、Codex の認証が必要です。\n" +
      "    以下のいずれかの方法でログインまたは認証を設定してください:\n\n" +
      "      1. ChatGPT アカウントでログイン (推奨):\n" +
      "         codex login\n\n" +
      "      2. API キーを使用する場合:\n" +
      "         export OPENAI_API_KEY=\"your-api-key\"\n" +
      "         または: codex login --with-api-key\n\n" +
      "    (Notice: Not logged in to Codex. Please run 'codex login' or set OPENAI_API_KEY.)\n" +
      "============================================================",
  };
}

/**
 * Verifies Codex authentication and logs a helpful warning/instruction if not logged in.
 */
export async function verifyCodexAuth(options: VerifyCodexAuthOptions = {}): Promise<CodexAuthCheckResult> {
  const result = await checkCodexAuth(options);
  const logger = options.logger ?? console.warn;

  if (result.message) {
    logger(result.message);
  }

  return result;
}
