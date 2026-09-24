import { EventEmitter } from "node:events";
import type { Phase } from "../orchestrator/context.js";

export type SubAgentStatus = "pending" | "running" | "completed" | "failed";

export interface SubAgentEvent {
  agentId: string;
  name: string;
  role: string;
  phase: string;
  status: SubAgentStatus;
  type: "start" | "thought" | "tool" | "result" | "log" | "finish";
  message?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface NodeStatusEvent {
  nodeName: string;
  status: "RUNNING" | "SUCCESS" | "FAILURE" | "SKIPPED";
  durationMs?: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface PhaseChangeEvent {
  phase: Phase;
  iteration: number;
  status: "started" | "completed" | "failed";
  path?: "FAST" | "DEEP";
  summary?: string;
  timestamp: string;
}

export interface ChatMessageEvent {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface HarnessFinishEvent {
  runId: string;
  phase: Phase;
  winner?: {
    candidateId: string;
    level: string;
    score: number;
  };
  error?: string;
  unresolved?: boolean;
  unresolvedReason?: string;
  summary: string;
  timestamp: string;
}

export type ServerEvent =
  | { type: "chat:message"; data: ChatMessageEvent }
  | { type: "phase:change"; data: PhaseChangeEvent }
  | { type: "node:status"; data: NodeStatusEvent }
  | { type: "subagent:event"; data: SubAgentEvent }
  | { type: "harness:finish"; data: HarnessFinishEvent }
  | { type: "harness:status"; data: { running: boolean; activeGoal?: string; phase?: string } };

export class HarnessEventBus extends EventEmitter {
  emitEvent(event: ServerEvent): void {
    this.emit("server_event", event);
  }

  emitChat(message: Omit<ChatMessageEvent, "timestamp">): void {
    this.emitEvent({
      type: "chat:message",
      data: { ...message, timestamp: new Date().toISOString() },
    });
  }

  emitPhase(phaseEvent: Omit<PhaseChangeEvent, "timestamp">): void {
    this.emitEvent({
      type: "phase:change",
      data: { ...phaseEvent, timestamp: new Date().toISOString() },
    });
  }

  emitNode(nodeEvent: NodeStatusEvent): void {
    this.emitEvent({
      type: "node:status",
      data: nodeEvent,
    });
  }

  emitSubAgent(agentEvent: Omit<SubAgentEvent, "timestamp">): void {
    this.emitEvent({
      type: "subagent:event",
      data: { ...agentEvent, timestamp: new Date().toISOString() },
    });
  }

  emitFinish(finishEvent: Omit<HarnessFinishEvent, "timestamp">): void {
    this.emitEvent({
      type: "harness:finish",
      data: { ...finishEvent, timestamp: new Date().toISOString() },
    });
  }
}
