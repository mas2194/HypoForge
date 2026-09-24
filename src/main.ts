import "dotenv/config";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { HarnessStateMachine } from "./orchestrator/state-machine.js";

async function runHarness(goal: string) {
  console.log(`\nTarget Goal: "${goal}"\n`);

  // Support USE_CODEX=false to explicitly disable. Default to true (supporting ChatGPT OAuth and API keys).
  const useCodex =
    process.env.USE_CODEX !== undefined
      ? process.env.USE_CODEX !== "false" && process.env.USE_CODEX !== "0"
      : true;

  const harness = new HarnessStateMachine({
    goal,
    useCodex,
    codexModel: process.env.CODEX_MODEL || process.env.OPENAI_MODEL,
    testCommand: process.env.HARNESS_TEST_COMMAND || "npm test",
  });

  const finalState = await harness.runUntilFinished();

  console.log("\n=== Execution Summary ===");
  console.log(`Final Phase: ${finalState.phase}`);
  if (finalState.winner) {
    console.log(`Winning Candidate: ${finalState.winner.implementation.candidateId}`);
    console.log(`Intervention Level: ${finalState.winner.implementation.level}`);
    console.log(`Final Evidence Score: ${finalState.winner.verification.score.toFixed(2)}`);
  } else {
    console.log("No winning candidate integrated.");
  }
}

async function main() {
  console.log("=== Autonomous Agent Harness Starting ===");
  console.log("Mode: Evidence-based Architecture Exploration (MVP)\n");

  const cliArgGoal = process.argv.slice(2).join(" ").trim();
  if (cliArgGoal) {
    await runHarness(cliArgGoal);
    return;
  }

  // Interactive mode: wait for user instruction
  const rl = readline.createInterface({ input, output });

  try {
    while (true) {
      const answer = await rl.question("Enter goal (or 'exit' to quit):\n> ");
      const trimmed = answer.trim();

      if (!trimmed) {
        continue;
      }

      if (
        trimmed.toLowerCase() === "exit" ||
        trimmed.toLowerCase() === "quit" ||
        trimmed.toLowerCase() === "q"
      ) {
        console.log("Exiting harness. Goodbye!");
        break;
      }

      try {
        await runHarness(trimmed);
      } catch (err) {
        console.error("Error during execution:", err);
      }

      console.log("\n" + "-".repeat(50) + "\n");
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
