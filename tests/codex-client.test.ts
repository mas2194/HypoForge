import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CodexClientManager } from "../src/codex/client.js";

describe("CodexClientManager Configuration", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.CODEX_SANDBOX_MODE;
    delete process.env.CODEX_APPROVAL_POLICY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("defaults to danger-full-access sandbox mode and never approval policy", () => {
    const manager = new CodexClientManager();
    expect(manager.defaultSandboxMode).toBe("danger-full-access");
    expect(manager.defaultApprovalPolicy).toBe("never");
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
    });
    expect(manager.defaultSandboxMode).toBe("danger-full-access");
    expect(manager.defaultApprovalPolicy).toBe("never");
  });
});
