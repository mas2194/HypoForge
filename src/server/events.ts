import type { HarnessContext } from "../orchestrator/context.js";
import type { SubAgentStatus } from "./event-bus.js";

export function emitPhaseChange(
  ctx: HarnessContext,
  status: "started" | "completed" | "failed",
  summary?: string
): void {
  ctx.eventBus?.emitPhase({
    phase: ctx.phase,
    iteration: ctx.iteration || 1,
    status,
    path: ctx.triageDecision?.path,
    summary,
  });
}

export function emitSubAgentStart(
  ctx: HarnessContext,
  agentId: string,
  name: string,
  role: string,
  message?: string,
  details?: Record<string, unknown>
): void {
  ctx.eventBus?.emitSubAgent({
    agentId,
    name,
    role,
    phase: ctx.phase,
    status: "running",
    type: "start",
    message,
    details,
  });
}

export function emitSubAgentLog(
  ctx: HarnessContext,
  agentId: string,
  name: string,
  role: string,
  type: "thought" | "tool" | "result" | "log",
  message: string,
  details?: Record<string, unknown>
): void {
  ctx.eventBus?.emitSubAgent({
    agentId,
    name,
    role,
    phase: ctx.phase,
    status: "running",
    type,
    message,
    details,
  });
}

export function emitSubAgentFinish(
  ctx: HarnessContext,
  agentId: string,
  name: string,
  role: string,
  status: SubAgentStatus,
  summary: string,
  details?: Record<string, unknown>
): void {
  ctx.eventBus?.emitSubAgent({
    agentId,
    name,
    role,
    phase: ctx.phase,
    status,
    type: "finish",
    message: summary,
    details,
  });
}
