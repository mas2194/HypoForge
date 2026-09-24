import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CodexClientManager } from "../src/codex/client.js";

describe("CodexClientManager Configuration", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.CODEX_SANDBOX_MODE;
    delete process.env.CODEX_APPROVAL_POLICY;
    delete process.env.CODEX_MODEL;
    delete process.env.OPENAI_MODEL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("defaults to danger-full-access sandbox mode, never approval policy, and gpt-6-luna model", () => {
    const manager = new CodexClientManager();
    expect(manager.defaultSandboxMode).toBe("danger-full-access");
    expect(manager.defaultApprovalPolicy).toBe("never");
    expect(manager.defaultModel).toBe("gpt-6-luna");
  });

  it("respects environment variables for sandbox mode and approval policy", () => {
    process.env.CODEX_SANDBOX_MODE = "workspace-write";
    process.env.CODEX_APPROVAL_POLICY = "always";

    const manager = new CodexClientManager();
    expect(manager.defaultSandboxMode).toBe("workspace-write");
    expect(manager.defaultApprovalPolicy).toBe("always");
  });

  it("allows overriding defaults via constructor options", () => {
    process.env.CODEX_SANDBOX_MODE = "workspace-write";

    const manager = new CodexClientManager({
      defaultSandboxMode: "danger-full-access",
      defaultApprovalPolicy: "never",
      defaultModel: "gpt-5.5",
    });
    expect(manager.defaultSandboxMode).toBe("danger-full-access");
    expect(manager.defaultApprovalPolicy).toBe("never");
    expect(manager.defaultModel).toBe("gpt-5.5");
  });

  it("respects CODEX_MODEL and OPENAI_MODEL environment variables", () => {
    process.env.OPENAI_MODEL = "gpt-5.5";
    let manager = new CodexClientManager();
    expect(manager.defaultModel).toBe("gpt-5.5");

    process.env.CODEX_MODEL = "gpt-5.6-luna";
    manager = new CodexClientManager();
    expect(manager.defaultModel).toBe("gpt-5.6-luna");
  });
});
