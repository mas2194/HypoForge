export * from "./types.js";
export * from "./nodes/action.js";
export * from "./nodes/composites.js";
export * from "./nodes/decorators.js";

import type { BTNode, NodeStatus } from "./types.js";
import { ActionNode, type ActionHandler } from "./nodes/action.js";
import { SequenceNode, SelectorNode, ParallelNode, type ParallelPolicy } from "./nodes/composites.js";
import {
  RetryNode,
  GuardNode,
  OptionalNode,
  InverterNode,
  TracerNode,
  type GuardPredicate,
  type TraceableContext,
} from "./nodes/decorators.js";

// Helper builders for clean, declarative tree definitions
export function action<TContext>(
  name: string,
  handler: ActionHandler<TContext>
): ActionNode<TContext> {
  return new ActionNode<TContext>(name, handler);
}

export function sequence<TContext>(
  name: string,
  children: BTNode<TContext>[]
): SequenceNode<TContext> {
  return new SequenceNode<TContext>(name, children);
}

export function selector<TContext>(
  name: string,
  children: BTNode<TContext>[]
): SelectorNode<TContext> {
  return new SelectorNode<TContext>(name, children);
}

export function parallel<TContext>(
  name: string,
  children: BTNode<TContext>[],
  policy?: ParallelPolicy
): ParallelNode<TContext> {
  return new ParallelNode<TContext>(name, children, policy);
}

export function retry<TContext>(
  maxAttempts: number,
  name: string,
  child: BTNode<TContext>,
  onRetry?: (attempt: number, context: TContext) => void | Promise<void>
): RetryNode<TContext> {
  return new RetryNode<TContext>(name, maxAttempts, child, onRetry);
}

export function guard<TContext>(
  predicate: GuardPredicate<TContext>,
  child: BTNode<TContext>,
  name?: string,
  fallbackStatus?: NodeStatus
): GuardNode<TContext> {
  return new GuardNode<TContext>(name ?? `Guard(${child.name})`, predicate, child, fallbackStatus);
}

export function optional<TContext>(
  name: string,
  child: BTNode<TContext>
): OptionalNode<TContext> {
  return new OptionalNode<TContext>(name, child);
}

export function inverter<TContext>(
  name: string,
  child: BTNode<TContext>
): InverterNode<TContext> {
  return new InverterNode<TContext>(name, child);
}

export function trace<TContext extends TraceableContext>(
  child: BTNode<TContext>
): TracerNode<TContext> {
  return new TracerNode<TContext>(child);
}
