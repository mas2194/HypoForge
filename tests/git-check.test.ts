import { describe, it, expect, vi } from "vitest";
import { checkGitEnvironment, verifyGitEnvironment } from "../src/git/check.js";

describe("checkGitEnvironment", () => {
  it("should report git not installed when git command fails or is missing", async () => {
    const mockExec = vi.fn().mockImplementation((file: string) => {
      if (file === "git") {
        const err: any = new Error("spawn git ENOENT");
        err.code = "ENOENT";
        return Promise.reject(err);
      }
      return Promise.resolve({ stdout: "", stderr: "" });
    });

    const result = await checkGitEnvironment({ execFn: mockExec });

    expect(result.isGitInstalled).toBe(false);
    expect(result.isGitRepo).toBe(false);
    expect(result.message).toBeDefined();
    expect(result.message).toContain("git コマンドが見つかりません");
    expect(result.message).toContain("Git command not found");
  });

  it("should report not a git repo and advise running 'git init' when outside of git repository", async () => {
    const mockExec = vi.fn().mockImplementation((file: string, args: string[]) => {
      if (args[0] === "--version") {
        return Promise.resolve({ stdout: "git version 2.39.0\n", stderr: "" });
      }
      if (args[0] === "rev-parse" && args[1] === "--is-inside-work-tree") {
        const err: any = new Error("fatal: not a git repository (or any of the parent directories): .git");
        return Promise.reject(err);
      }
      return Promise.resolve({ stdout: "", stderr: "" });
    });

    const result = await checkGitEnvironment({ execFn: mockExec });

    expect(result.isGitInstalled).toBe(true);
    expect(result.gitVersion).toBe("git version 2.39.0");
    expect(result.isGitRepo).toBe(false);
    expect(result.message).toBeDefined();
    expect(result.message).toContain("現在の作業ディレクトリは Git リポジトリではありません");
    expect(result.message).toContain("git init");
  });

  it("should report success and no warning message when inside a valid git repository", async () => {
    const mockExec = vi.fn().mockImplementation((file: string, args: string[]) => {
      if (args[0] === "--version") {
        return Promise.resolve({ stdout: "git version 2.39.0\n", stderr: "" });
      }
      if (args[0] === "rev-parse" && args[1] === "--is-inside-work-tree") {
        return Promise.resolve({ stdout: "true\n", stderr: "" });
      }
      return Promise.resolve({ stdout: "", stderr: "" });
    });

    const result = await checkGitEnvironment({ execFn: mockExec });

    expect(result.isGitInstalled).toBe(true);
    expect(result.gitVersion).toBe("git version 2.39.0");
    expect(result.isGitRepo).toBe(true);
    expect(result.message).toBeUndefined();
  });

  it("should check the real environment accurately", async () => {
    // In our test environment, git should be installed and inside this repository
    const result = await checkGitEnvironment();

    expect(result.isGitInstalled).toBe(true);
    expect(result.gitVersion).toBeDefined();
    expect(result.isGitRepo).toBe(true);
    expect(result.message).toBeUndefined();
  });
});

describe("verifyGitEnvironment", () => {
  it("should call logger when directory is not a git repository", async () => {
    const mockExec = vi.fn().mockImplementation((file: string, args: string[]) => {
      if (args[0] === "--version") {
        return Promise.resolve({ stdout: "git version 2.39.0\n", stderr: "" });
      }
      return Promise.reject(new Error("fatal: not a git repo"));
    });

    const logger = vi.fn();
    const result = await verifyGitEnvironment({ execFn: mockExec, logger });

    expect(result.isGitRepo).toBe(false);
    expect(logger).toHaveBeenCalledTimes(1);
    expect(logger).toHaveBeenCalledWith(expect.stringContaining("git init"));
  });

  it("should not call logger when git and repository are valid", async () => {
    const mockExec = vi.fn().mockImplementation((file: string, args: string[]) => {
      if (args[0] === "--version") {
        return Promise.resolve({ stdout: "git version 2.39.0\n", stderr: "" });
      }
      if (args[0] === "rev-parse") {
        return Promise.resolve({ stdout: "true\n", stderr: "" });
      }
      return Promise.resolve({ stdout: "", stderr: "" });
    });

    const logger = vi.fn();
    const result = await verifyGitEnvironment({ execFn: mockExec, logger });

    expect(result.isGitRepo).toBe(true);
    expect(logger).not.toHaveBeenCalled();
  });
});
