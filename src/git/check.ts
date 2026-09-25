import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GitCheckResult {
  isGitInstalled: boolean;
  gitVersion?: string;
  isGitRepo: boolean;
  message?: string;
}

export type ExecFileFunction = (
  file: string,
  args: string[],
  options?: { cwd?: string }
) => Promise<{ stdout: string; stderr: string }>;

export interface VerifyGitOptions {
  cwd?: string;
  logger?: (message: string) => void;
  execFn?: ExecFileFunction;
}

/**
 * Checks if the git command is available and whether the current directory is a git repository.
 */
export async function checkGitEnvironment(options: VerifyGitOptions = {}): Promise<GitCheckResult> {
  const cwd = options.cwd ?? process.cwd();
  const exec = options.execFn ?? (execFileAsync as unknown as ExecFileFunction);

  // 1. Check if git command is installed and accessible
  let gitVersion: string | undefined;
  try {
    const { stdout } = await exec("git", ["--version"]);
    gitVersion = stdout.trim();
  } catch {
    return {
      isGitInstalled: false,
      isGitRepo: false,
      message:
        "============================================================\n" +
        "⚠️  [Git] git コマンドが見つかりません。\n" +
        "    HypoForge の実行には Git が必要です。\n" +
        "    Git をインストールし、PATH に設定されていることを確認してください。\n" +
        "    (Git command not found. Please ensure Git is installed and in your PATH.)\n" +
        "============================================================",
    };
  }

  // 2. Check if current directory is inside a git repository work tree
  try {
    const { stdout } = await exec("git", ["rev-parse", "--is-inside-work-tree"], { cwd });
    if (stdout.trim() === "true") {
      return {
        isGitInstalled: true,
        gitVersion,
        isGitRepo: true,
      };
    }
  } catch {
    // Failed or not inside a work tree
  }

  return {
    isGitInstalled: true,
    gitVersion,
    isGitRepo: false,
    message:
      "============================================================\n" +
      "⚠️  [Git] 現在の作業ディレクトリは Git リポジトリではありません。\n" +
      "    以下のコマンドを実行して Git リポジトリを初期化してください:\n\n" +
      "      git init\n\n" +
      "    (Notice: Current directory is not a Git repository. Please run 'git init' to initialize.)\n" +
      "============================================================",
  };
}

/**
 * Verifies git environment and outputs a message if git is missing or the directory is not a git repo.
 */
export async function verifyGitEnvironment(options: VerifyGitOptions = {}): Promise<GitCheckResult> {
  const result = await checkGitEnvironment(options);
  const logger = options.logger ?? console.warn;

  if (result.message) {
    logger(result.message);
  }

  return result;
}
