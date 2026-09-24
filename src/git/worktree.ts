import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";

const execFileAsync = promisify(execFile);

export interface WorktreeInfo {
  path: string;
  commit: string;
  branch: string;
}

export interface WorktreeManagerOptions {
  repoRoot?: string;
  worktreesDirName?: string;
}

export class WorktreeManager {
  readonly repoRoot: string;
  readonly worktreesDir: string;

  constructor(options: WorktreeManagerOptions = {}) {
    this.repoRoot = path.resolve(options.repoRoot ?? process.cwd());
    this.worktreesDir = path.resolve(
      this.repoRoot,
      options.worktreesDirName ?? "worktrees"
    );
  }

  private async git(args: string[], cwd: string = this.repoRoot): Promise<string> {
    try {
      const { stdout } = await execFileAsync("git", args, { cwd });
      return stdout.trim();
    } catch (err: any) {
      const message = err.stderr ? err.stderr.trim() : err.message;
      throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${message}`);
    }
  }

  /**
   * Creates a new git worktree with a dedicated branch.
   */
  async createWorktree(
    branchName: string,
    dirName?: string
  ): Promise<string> {
    await fs.mkdir(this.worktreesDir, { recursive: true });

    const targetDirName = dirName ?? branchName.replace(/[^a-zA-Z0-9_-]/g, "_");
    const targetPath = path.resolve(this.worktreesDir, targetDirName);

    // If directory already exists, clean it up
    try {
      await fs.access(targetPath);
      await this.removeWorktree(targetPath, false).catch(() => {});
      await fs.rm(targetPath, { recursive: true, force: true }).catch(() => {});
    } catch {
      // Doesn't exist, proceed
    }

    await this.git(["worktree", "add", "-B", branchName, targetPath]);

    return targetPath;
  }

  /**
   * Removes an existing worktree and optionally deletes its branch.
   */
  async removeWorktree(
    worktreePath: string,
    deleteBranch: boolean = false,
    branchName?: string
  ): Promise<void> {
    const resolvedPath = path.resolve(worktreePath);

    try {
      await this.git(["worktree", "remove", "--force", resolvedPath]);
    } catch {
      await fs.rm(resolvedPath, { recursive: true, force: true }).catch(() => {});
      await this.git(["worktree", "prune"]).catch(() => {});
    }

    await this.git(["worktree", "prune"]).catch(() => {});

    if (deleteBranch && branchName) {
      try {
        await this.git(["branch", "-D", branchName]);
      } catch {
        // Branch deletion failure can be ignored
      }
    }
  }

  /**
   * Lists all currently registered worktrees.
   */
  async listWorktrees(): Promise<WorktreeInfo[]> {
    const output = await this.git(["worktree", "list", "--porcelain"]);
    const lines = output.split("\n");
    const worktrees: WorktreeInfo[] = [];

    let current: Partial<WorktreeInfo> = {};

    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        if (current.path) {
          worktrees.push(current as WorktreeInfo);
        }
        current = { path: line.replace("worktree ", "").trim() };
      } else if (line.startsWith("HEAD ")) {
        current.commit = line.replace("HEAD ", "").trim();
      } else if (line.startsWith("branch ")) {
        current.branch = line.replace("branch ", "").trim().replace("refs/heads/", "");
      } else if (line.trim() === "" && current.path) {
        worktrees.push(current as WorktreeInfo);
        current = {};
      }
    }

    if (current.path) {
      worktrees.push(current as WorktreeInfo);
    }

    return worktrees;
  }

  /**
   * Merges the specified candidate branch into a target branch (defaults to current branch).
   */
  async mergeBranch(
    branchName: string,
    targetBranch?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (targetBranch) {
        await this.git(["checkout", targetBranch]);
      }
      await this.git(["merge", "--no-ff", branchName, "-m", `Merge branch '${branchName}' (selected candidate)`]);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async revParse(ref: string = "HEAD", cwd?: string): Promise<string> {
    return this.git(["rev-parse", ref], cwd);
  }

  /**
   * Cleans up all worktrees inside the worktrees directory.
   */
  async cleanAllWorktrees(): Promise<void> {
    const worktrees = await this.listWorktrees();
    for (const wt of worktrees) {
      if (wt.path.startsWith(this.worktreesDir)) {
        await this.removeWorktree(wt.path, false);
      }
    }
    await this.git(["worktree", "prune"]).catch(() => {});
  }
}
