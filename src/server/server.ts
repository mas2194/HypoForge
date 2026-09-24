import * as http from "node:http";
import type { ModelReasoningEffort } from "@openai/codex-sdk";
import { HarnessRunner } from "./harness-runner.js";
import { renderWebUI } from "./web/ui.js";
import { listWorkspaceFiles } from "../codex/file-mention.js";
import { loadCachedModels } from "../codex/config.js";

export interface ServerOptions {
  port?: number;
  model?: string;
  effort?: ModelReasoningEffort;
  runner?: HarnessRunner;
}

export interface RunningServer {
  server: http.Server;
  port: number;
  runner: HarnessRunner;
  close: () => Promise<void>;
}

export async function startWebServer(options: ServerOptions = {}): Promise<RunningServer> {
  const runner =
    options.runner ??
    new HarnessRunner({
      model: options.model,
      effort: options.effort,
    });

  const sseClients = new Set<http.ServerResponse>();

  // Broadcast events to all active SSE subscribers
  runner.eventBus.on("server_event", (event) => {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(payload);
      } catch {
        sseClients.delete(client);
      }
    }
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;

    // CORS Headers for flexible access
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // 1. Root: Web UI
    if (pathname === "/" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderWebUI());
      return;
    }

    // 2. Server-Sent Events (SSE) Stream
    if (pathname === "/api/events" && req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(": keep-alive\n\n");

      // Replay existing events for newly connected client
      for (const chat of runner.chatHistory) {
        res.write(`data: ${JSON.stringify({ type: "chat:message", data: chat })}\n\n`);
      }
      for (const phase of runner.phaseHistory) {
        res.write(`data: ${JSON.stringify({ type: "phase:change", data: phase })}\n\n`);
      }
      for (const agent of runner.subAgentHistory) {
        res.write(`data: ${JSON.stringify({ type: "subagent:event", data: agent })}\n\n`);
      }

      sseClients.add(res);

      req.on("close", () => {
        sseClients.delete(res);
      });
      return;
    }

    // 3. Status API
    if (pathname === "/api/status" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(runner.getStatus()));
      return;
    }

    // 4. Models API
    if (pathname === "/api/models" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(loadCachedModels()));
      return;
    }

    // 5. Workspace Files API for @ completion
    if (pathname === "/api/files" && req.method === "GET") {
      try {
        const files = await listWorkspaceFiles();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(files));
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // 6. Post Chat Message / Goal
    if (pathname === "/api/chat" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", async () => {
        try {
          const parsed = JSON.parse(body || "{}");
          const message = parsed.message;
          if (typeof message !== "string" || !message.trim()) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Missing or invalid 'message'" }));
            return;
          }

          // Trigger execution in background
          runner.handleUserMessage(message).catch((err) => {
            console.error("Error in handleUserMessage:", err);
          });

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "accepted" }));
        } catch (err: any) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // 7. Post Slash Command
    if (pathname === "/api/command" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", async () => {
        try {
          const parsed = JSON.parse(body || "{}");
          const command = parsed.command;
          if (typeof command !== "string" || !command.trim()) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Missing or invalid 'command'" }));
            return;
          }

          runner.handleUserMessage(command).catch((err) => {
            console.error("Error in command execution:", err);
          });

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "accepted" }));
        } catch (err: any) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // 404 Fallback
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  });

  const port = options.port ?? (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);

  return new Promise<RunningServer>((resolve, reject) => {
    server.on("error", (err) => {
      reject(err);
    });

    server.listen(port, () => {
      const actualPort = (server.address() as any)?.port ?? port;
      resolve({
        server,
        port: actualPort,
        runner,
        close: async () => {
          for (const client of sseClients) {
            try {
              client.end();
            } catch {}
          }
          sseClients.clear();
          return new Promise<void>((resClose) => {
            server.close(() => resClose());
          });
        },
      });
    });
  });
}
