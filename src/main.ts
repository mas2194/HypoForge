import "dotenv/config";
import { CodexClientManager } from "./codex/client.js";

async function main() {
  console.log("=== Autonomous Agent Harness Starting ===");
  console.log("Mode: Evidence-based Architecture Exploration");

  const manager = new CodexClientManager();
  console.log("Codex SDK & Agents SDK initialized successfully.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
