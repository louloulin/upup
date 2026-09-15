/**
 * Port interfaces for `AgentRunnerController`.
 *
 * Dependency injection contracts that let the runner swap session storage,
 * file history, message queueing, and tool-streaming adapters without
 * coupling to a specific TUI host. All interfaces stay narrow and free of
 * Pi internals — callers can build test doubles with plain object literals.
 */

import type { PiSessionService } from '@upup/pi-session';
import type { AgentConfig } from './agent-runner-types';
import type { UpUpAgentEvent } from '@upup/pi-runtime';
import type { InMemoryChatHistory } from './in-memory-chat-history';
import type { AgentPortsLocal } from '@upup/commands';
import type { MessageQueue, PromptRunner } from '@upup/utils';

export type TuiCommandCapabilities = AgentPortsLocal;

export interface AgentRunnerSessionService {
  create(input: { cwd: string; firstPrompt: string; metadata: Record<string, unknown> }): Promise<{ id: string }>;
  fork(id: string): Promise<{ id: string }>;
  messages(id: string): Promise<Array<{ type: string; content: string; additional_kwargs?: Record<string, unknown> }>>;
}

export interface AgentRunnerSessionTracker {
  startSession(sessionId: string): Promise<string>;
  isToolApproved(toolName: string): boolean;
}

export interface AgentRunnerFileHistory {
  initialize(sessionId: string): void;
  record(itemId: string, sessionId: string): void;
}

export interface AgentRunnerStreamOptions {
  sessionId: string;
  inMemoryHistory: InMemoryChatHistory;
}

export interface AgentRunnerPorts {
  stream(
    prompt: string,
    config: AgentConfig,
    options: AgentRunnerStreamOptions,
  ): AsyncGenerator<UpUpAgentEvent>;
  sessionService: AgentRunnerSessionService;
  sessionTracker: AgentRunnerSessionTracker;
  fileHistory: AgentRunnerFileHistory;
  messageQueue: MessageQueue;
  renderMessages(messages: Array<{ id: string; type: string; content: string; timestamp: number }>): RenderableMessage[];
}

export interface TuiRuntime {
  sessionService: AgentRunnerSessionService & Pick<PiSessionService, 'list' | 'remove' | 'rename' | 'tag'>;
  sessionTracker: AgentRunnerSessionTracker;
  getSessionTools: (sessionId: string) => readonly { name: string; description: string }[];
  renderMessages: AgentRunnerPorts['renderMessages'];
  promptRunner: PromptRunner;
}

export type ChangeListener = () => void;

export type RenderableMessage = {
  id: string;
  type: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  timestamp?: number;
  toolName?: string;
  toolResult?: string;
  isStreaming?: boolean;
  depth: number;
  parentId?: string;
  toolUseId?: string;
};

export type HistoryMessageListener = (msg: RenderableMessage) => void;
