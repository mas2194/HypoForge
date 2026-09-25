import * as vm from "node:vm";
import { describe, it, expect, afterEach } from "vitest";
import { parseCliArgs } from "../src/main.js";
import { startWebServer, type RunningServer } from "../src/server/server.js";
import { HarnessRunner } from "../src/server/harness-runner.js";

describe("Web Server and Server Mode", () => {
  let activeServer: RunningServer | undefined;

  afterEach(async () => {
    if (activeServer) {
      await activeServer.close();
      activeServer = undefined;
    }
  });

  describe("CLI Argument Parsing for Server Mode", () => {
    it("parses --server flag correctly", () => {
      const parsed = parseCliArgs(["--server"]);
      expect(parsed.server).toBe(true);
      expect(parsed.goal).toBeUndefined();
    });

    it("parses -s shorthand flag correctly", () => {
      const parsed = parseCliArgs(["-s", "--port", "4000"]);
      expect(parsed.server).toBe(true);
      expect(parsed.port).toBe(4000);
    });

    it("parses server with custom model and effort", () => {
      const parsed = parseCliArgs(["--server", "-m", "gpt-4o", "-e", "high", "-p", "8080"]);
      expect(parsed.server).toBe(true);
      expect(parsed.model).toBe("gpt-4o");
      expect(parsed.effort).toBe("high");
      expect(parsed.port).toBe(8080);
    });
  });

  describe("HTTP & SSE Endpoints", () => {
    it("starts server, serves HTML Web UI at GET / and status at GET /api/status", async () => {
      activeServer = await startWebServer({ port: 0 }); // port 0 assigns random available port
      const base = `http://localhost:${activeServer.port}`;

      // 1. GET / (Web UI HTML)
      const htmlRes = await fetch(`${base}/`);
      expect(htmlRes.status).toBe(200);
      expect(htmlRes.headers.get("content-type")).toContain("text/html");
      const htmlText = await htmlRes.text();
      expect(htmlText).toContain("Autonomous Agent Harness");
      expect(htmlText).toContain("Model Conversation");
      expect(htmlText).toContain("Harness Stage Pipeline");
      expect(htmlText).toContain("Codex Sub-Agent Activity");
      expect(htmlText).toContain("viewer-pane");
      expect(htmlText).toContain("filetree-pane");
      expect(htmlText).toContain("File Content");
      expect(htmlText).toContain("Workspace");
      expect(htmlText).toContain("hl-keyword");
      expect(htmlText).toContain("hl-string");
      expect(htmlText).toContain("input-toolbar");
      expect(htmlText).toContain("model-select");
      expect(htmlText).toContain("effort-select");

      // 2. GET /api/status
      const statusRes = await fetch(`${base}/api/status`);
      expect(statusRes.status).toBe(200);
      const statusData = await statusRes.json();
      expect(statusData.isRunning).toBe(false);
      expect(statusData.model).toBeDefined();
      expect(statusData.effort).toBeDefined();

      // 3. GET /api/models
      const modelsRes = await fetch(`${base}/api/models`);
      expect(modelsRes.status).toBe(200);
      const modelsData = await modelsRes.json();
      expect(Array.isArray(modelsData)).toBe(true);
      expect(modelsData.length).toBeGreaterThanOrEqual(10);
      // Verify key models across categories exist
      expect(modelsData.some((m: any) => m.slug === "gpt-6-luna")).toBe(true);
      expect(modelsData.some((m: any) => m.slug === "o3-mini")).toBe(true);
      expect(modelsData.some((m: any) => m.slug === "gpt-4o")).toBe(true);
      expect(modelsData.some((m: any) => m.slug === "gpt-5.6-terra")).toBe(true);
      // Verify categories are populated
      const categories = new Set(modelsData.map((m: any) => m.category));
      expect(categories.has("GPT-6 Frontier")).toBe(true);
      expect(categories.has("o-Series Reasoning")).toBe(true);
      expect(categories.has("GPT-4o & GPT-4")).toBe(true);

      // 4. GET /api/files
      const filesRes = await fetch(`${base}/api/files`);
      expect(filesRes.status).toBe(200);
      const filesData = await filesRes.json();
      expect(Array.isArray(filesData)).toBe(true);
      expect(filesData).toContain("package.json");

      // 5. GET /api/file (File content inspection)
      const fileRes = await fetch(`${base}/api/file?path=package.json`);
      expect(fileRes.status).toBe(200);
      const fileData = await fileRes.json();
      expect(fileData.path).toBe("package.json");
      expect(fileData.content).toContain("my_harness");
      expect(fileData.lines).toBeGreaterThan(0);
      expect(fileData.bytes).toBeGreaterThan(0);
      expect(fileData.language).toBe("json");

      // 5a. Missing path param -> 400
      const missingParamRes = await fetch(`${base}/api/file`);
      expect(missingParamRes.status).toBe(400);

      // 5b. Nonexistent file -> 404
      const nonexistentRes = await fetch(`${base}/api/file?path=does-not-exist.txt`);
      expect(nonexistentRes.status).toBe(404);

      // 5c. Path traversal prevention -> 403
      const traversalRes = await fetch(`${base}/api/file?path=../../etc/passwd`);
      expect(traversalRes.status).toBe(403);
    });

    it("handles slash commands via POST /api/command to change model and effort", async () => {
      const runner = new HarnessRunner({ model: "o3-mini", effort: "medium" });
      activeServer = await startWebServer({ port: 0, runner });
      const base = `http://localhost:${activeServer.port}`;

      // Switch model via /model
      const cmdRes = await fetch(`${base}/api/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "/model gpt-4o" }),
      });
      expect(cmdRes.status).toBe(200);
      expect(runner.model).toBe("gpt-4o");

      // Switch effort via /effort
      const cmdRes2 = await fetch(`${base}/api/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "/effort high" }),
      });
      expect(cmdRes2.status).toBe(200);
      expect(runner.effort).toBe("high");
    });

    it("streams events to connected SSE client via GET /api/events", async () => {
      const runner = new HarnessRunner();
      activeServer = await startWebServer({ port: 0, runner });
      const base = `http://localhost:${activeServer.port}`;

      const controller = new AbortController();
      const sseRes = await fetch(`${base}/api/events`, {
        signal: controller.signal,
      });

      expect(sseRes.status).toBe(200);
      expect(sseRes.headers.get("content-type")).toContain("text/event-stream");

      const reader = sseRes.body?.getReader();
      expect(reader).toBeDefined();

      // Emit event through runner
      runner.eventBus.emitSubAgent({
        agentId: "test-agent",
        name: "Test SubAgent",
        role: "Unit Testing",
        phase: "Inspect",
        status: "running",
        type: "start",
        message: "Testing SSE streaming",
      });

      // Read chunk (first chunk may be : keep-alive comment)
      let combinedText = "";
      while (!combinedText.includes("test-agent")) {
        const { value, done } = await reader!.read();
        if (done) break;
        combinedText += new TextDecoder().decode(value);
      }

      expect(combinedText).toContain("test-agent");
      expect(combinedText).toContain("Testing SSE streaming");

      controller.abort();
    });

    it("serves valid client-side JavaScript in Web UI with no syntax errors", async () => {
      activeServer = await startWebServer({ port: 0 });
      const base = `http://localhost:${activeServer.port}`;

      const res = await fetch(`${base}/`);
      const html = await res.text();
      const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);

      expect(scriptMatch).not.toBeNull();
      const scriptCode = scriptMatch![1];
      expect(scriptCode.length).toBeGreaterThan(100);

      // Verify the client script parses cleanly without syntax errors
      expect(() => {
        new vm.Script(scriptCode, { filename: "web-ui.js" });
      }).not.toThrow();
    });

    it("accepts chat message and registers in chat history", async () => {
      const runner = new HarnessRunner();
      activeServer = await startWebServer({ port: 0, runner });
      const base = `http://localhost:${activeServer.port}`;

      const chatRes = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "/help" }),
      });

      expect(chatRes.status).toBe(200);
      const userMsg = runner.chatHistory.find((m) => m.text === "/help");
      expect(userMsg).toBeDefined();
      expect(userMsg?.role).toBe("user");

      const assistantMsg = runner.chatHistory.find((m) => m.role === "assistant");
      expect(assistantMsg).toBeDefined();
    });

    it("streams chat messages and status over SSE when user posts a message", async () => {
      const runner = new HarnessRunner();
      activeServer = await startWebServer({ port: 0, runner });
      const base = `http://localhost:${activeServer.port}`;

      const controller = new AbortController();
      const sseRes = await fetch(`${base}/api/events`, {
        signal: controller.signal,
      });
      const reader = sseRes.body?.getReader();
      expect(reader).toBeDefined();

      // Send slash command message via /api/chat
      const postRes = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "/help" }),
      });
      expect(postRes.status).toBe(200);

      // Read SSE stream until we see the user message and assistant response
      let streamData = "";
      while (!streamData.includes("/help") || !streamData.includes("Available Commands")) {
        const { value, done } = await reader!.read();
        if (done) break;
        streamData += new TextDecoder().decode(value);
      }

      expect(streamData).toContain("/help");
      expect(streamData).toContain("chat:message");
      expect(streamData).toContain("Available Commands");

      controller.abort();
    });
  });
});
