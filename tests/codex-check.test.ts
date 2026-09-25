import { describe, it, expect, vi } from "vitest";
import { checkCodexAuth, verifyCodexAuth } from "../src/codex/check.js";

describe("checkCodexAuth", () => {
  it("should skip check when USE_CODEX=false", async () => {
    const mockExec = vi.fn();
    const result = await checkCodexAuth({
      env: { USE_CODEX: "false" } as any,
      execFn: mockExec,
    });

    expect(result.isCodexEnabled).toBe(false);
    expect(result.isLoggedIn).toBe(true);
    expect(result.message).toBeUndefined();
    expect(mockExec).not.toHaveBeenCalled();
  });

  it("should report success when codex login status returns Logged in", async () => {
    const mockExec = vi.fn().mockImplementation((file: string, args: string[]) => {
      if (file === "codex" && args[0] === "login" && args[1] === "status") {
        return Promise.resolve({ stdout: "Logged in using ChatGPT\n", stderr: "" });
      }
      return Promise.reject(new Error("unknown command"));
    });

    const result = await checkCodexAuth({
      env: { USE_CODEX: "true" } as any,
      execFn: mockExec,
    });

    expect(result.isCodexEnabled).toBe(true);
    expect(result.isCodexInstalled).toBe(true);
    expect(result.isLoggedIn).toBe(true);
    expect(result.authMethod).toBe("Logged in using ChatGPT");
    expect(result.message).toBeUndefined();
  });

  it("should report not logged in and advise running 'codex login' when not authenticated", async () => {
    const mockExec = vi.fn().mockImplementation((file: string, args: string[]) => {
      if (file === "codex" && args[0] === "login" && args[1] === "status") {
        const err: any = new Error("Command failed");
        err.stdout = "Not logged in";
        err.stderr = "";
        return Promise.reject(err);
      }
      return Promise.reject(new Error("unknown command"));
    });

    const result = await checkCodexAuth({
      env: { USE_CODEX: "true" } as any,
      execFn: mockExec,
    });

    expect(result.isCodexEnabled).toBe(true);
    expect(result.isCodexInstalled).toBe(true);
    expect(result.isLoggedIn).toBe(false);
    expect(result.message).toBeDefined();
    expect(result.message).toContain("Codex にログインしていません");
    expect(result.message).toContain("codex login");
  });

  it("should fallback to OPENAI_API_KEY when codex login is not active but key is set", async () => {
    const mockExec = vi.fn().mockImplementation((file: string, args: string[]) => {
      if (file === "codex" && args[0] === "login" && args[1] === "status") {
        const err: any = new Error("Command failed");
        err.stdout = "Not logged in";
        return Promise.reject(err);
      }
      return Promise.reject(new Error("unknown command"));
    });

    const result = await checkCodexAuth({
      env: { USE_CODEX: "true", OPENAI_API_KEY: "sk-test-key-12345" } as any,
      execFn: mockExec,
    });

    expect(result.isCodexEnabled).toBe(true);
    expect(result.isLoggedIn).toBe(true);
    expect(result.authMethod).toBe("OPENAI_API_KEY");
    expect(result.message).toBeUndefined();
  });

  it("should report missing codex CLI when executable is not found", async () => {
    const mockExec = vi.fn().mockImplementation((file: string) => {
      if (file === "codex") {
        const err: any = new Error("spawn codex ENOENT");
        err.code = "ENOENT";
        return Promise.reject(err);
      }
      return Promise.resolve({ stdout: "", stderr: "" });
    });

    const result = await checkCodexAuth({
      env: { USE_CODEX: "true" } as any,
      execFn: mockExec,
    });

    expect(result.isCodexEnabled).toBe(true);
    expect(result.isCodexInstalled).toBe(false);
    expect(result.isLoggedIn).toBe(false);
    expect(result.message).toBeDefined();
    expect(result.message).toContain("codex コマンドが見つかりません");
  });

  it("should check the real environment accurately", async () => {
    const result = await checkCodexAuth();

    expect(result.isCodexEnabled).toBe(true);
    expect(result.isCodexInstalled).toBe(true);
    expect(result.isLoggedIn).toBe(true);
    expect(result.authMethod).toBeDefined();
  });
});

describe("verifyCodexAuth", () => {
  it("should call logger when not logged in", async () => {
    const mockExec = vi.fn().mockImplementation(() => {
      const err: any = new Error("Command failed");
      err.stdout = "Not logged in";
      return Promise.reject(err);
    });

    const logger = vi.fn();
    const result = await verifyCodexAuth({
      env: { USE_CODEX: "true" } as any,
      execFn: mockExec,
      logger,
    });

    expect(result.isLoggedIn).toBe(false);
    expect(logger).toHaveBeenCalledTimes(1);
    expect(logger).toHaveBeenCalledWith(expect.stringContaining("codex login"));
  });

  it("should not call logger when logged in", async () => {
    const mockExec = vi.fn().mockImplementation(() => {
      return Promise.resolve({ stdout: "Logged in using ChatGPT\n", stderr: "" });
    });

    const logger = vi.fn();
    const result = await verifyCodexAuth({
      env: { USE_CODEX: "true" } as any,
      execFn: mockExec,
      logger,
    });

    expect(result.isLoggedIn).toBe(true);
    expect(logger).not.toHaveBeenCalled();
  });
});
