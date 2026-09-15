import { createMessageQueue, type MessageQueue, type QueuePriority } from '@upup/utils';
import { HEARTBEAT_OK_TOKEN } from './heartbeat/suppression';
import type { GatewayAgentRuntimePort } from './runtime-port';
import type { UpUpAgentEvent } from '@upup/pi-runtime';
import type { Model } from '@earendil-works/pi-ai';
import type { ModelRuntime } from '@earendil-works/pi-coding-agent';

export type GroupContext = {
  groupName?: string;
  membersList?: string;
  activationMode: 'mention';
};

type SessionState = {
  tail: Promise<void>;
  queue: MessageQueue;
  isRunning: boolean;
};

const sessions = new Map<string, SessionState>();

function getSession(sessionKey: string, model: string): SessionState {
  const existing = sessions.get(sessionKey);
  if (existing) {
    return existing;
  }
  const created: SessionState = {
    tail: Promise.resolve(),
    queue: createMessageQueue(),
    isRunning: false,
  };
  sessions.set(sessionKey, created);
  return created;
}

/**
 * Check whether an agent is currently running for a given session.
 * Used by the gateway to decide whether to enqueue or start a new turn.
 */
export function isSessionRunning(sessionKey: string, runtime: GatewayAgentRuntimePort): boolean {
  return runtime.isSessionRunning(sessionKey) || (sessions.get(sessionKey)?.isRunning ?? false);
}

/**
 * Enqueue a message for a session whose agent is currently running.
 * The agent will drain the queue between tool rounds.
 */
export function enqueueForSession(
  sessionKey: string,
  model: string,
  text: string,
  priority: QueuePriority = 'next',
): void {
  const session = getSession(sessionKey, model);
  session.queue.enqueue({
    text,
    priority,
    enqueuedAt: Date.now(),
    source: `whatsapp:${sessionKey}`,
  });
}

export type AgentRunRequest = {
  sessionKey: string;
  query: string;
  model: string;
  modelProvider: string;
  maxIterations?: number;
  signal?: AbortSignal;
  onEvent?: (event: UpUpAgentEvent) => void | Promise<void>;
  isHeartbeat?: boolean;
  /** Run without persistent session history or memory (minimal context, ~95% token savings). */
  isolatedSession?: boolean;
  channel?: string;
  groupContext?: GroupContext;
  /** Deterministic Pi injection used by contract tests and local adapters. */
  piModel?: Model<any>;
  piModelRuntime?: ModelRuntime;
};



export async function runAgentForMessage(req: AgentRunRequest, runtime: GatewayAgentRuntimePort): Promise<string> {
  const isolated = req.isolatedSession ?? false;
  const session = isolated ? null : getSession(req.sessionKey, req.model);
  let finalAnswer = '';

  const run = async () => {
    if (session) {
      session.isRunning = true;
    }
    try {
      finalAnswer = await runtime.runPrompt(req.query, {
        sessionKey: isolated ? undefined : req.sessionKey,
        model: req.model,
        modelProvider: req.modelProvider,
        modelInstance: req.piModel,
        modelRuntime: req.piModelRuntime,
        signal: req.signal,
        onEvent: req.onEvent,
      });

      // Post-run: drain any messages that arrived after the agent's last check
      if (session && !session.queue.isEmpty()) {
        const remaining = session.queue.dequeueAll();
        const mergedText = remaining.map(m => m.text).join('\n\n');
        finalAnswer = await runtime.runPrompt(mergedText, {
          sessionKey: isolated ? undefined : req.sessionKey,
          model: req.model,
          modelProvider: req.modelProvider,
          modelInstance: req.piModel,
          modelRuntime: req.piModelRuntime,
          signal: req.signal,
        });
      }

      // Prune HEARTBEAT_OK turns to avoid context pollution
      if (session && req.isHeartbeat && finalAnswer.trim().toUpperCase().includes(HEARTBEAT_OK_TOKEN)) {
        finalAnswer = '';
      }
    } finally {
      if (session) session.isRunning = false;
    }

  };

  if (session) {
    // Serialize per-session turns while allowing cross-session concurrency.
    session.tail = session.tail.then(run, run);
    await session.tail;
  } else {
    await run();
  }
  return finalAnswer;
}
