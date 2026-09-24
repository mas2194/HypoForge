import { HarnessOrchestrator, type OrchestratorOptions } from "./orchestrator.js";
import { Phase, type HarnessContext } from "./context.js";

export { Phase, type HarnessContext as OrchestratorState, type OrchestratorOptions };

export class HarnessStateMachine {
  private orchestrator: HarnessOrchestrator;

  constructor(options: OrchestratorOptions) {
    this.orchestrator = new HarnessOrchestrator(options);
  }

  get state(): HarnessContext {
    return this.orchestrator.context;
  }

  async step(): Promise<HarnessContext> {
    // If stepped manually, tick the tree
    return this.runUntilFinished();
  }

  async runUntilFinished(): Promise<HarnessContext> {
    return this.orchestrator.runUntilFinished();
  }
}
