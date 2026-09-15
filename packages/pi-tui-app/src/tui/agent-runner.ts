import type { InMemoryChatHistory } from './in-memory-chat-history';
import type { UpUpAgentEvent } from '@upup/pi-runtime';
import type { AgentConfig, ApprovalDecision, DisplayEvent, DoneEvent, StreamMode, UiEvent } from './agent-runner-types';
import type { MessageQueue } from '@upup/utils';
import type { PromptRunner } from '@upup/utils';
import type { PiSessionService } from '@upup/pi-session';
import type { AgentPortsLocal } from '@upup/commands';
export type TuiCommandCapabilities = AgentPortsLocal;
import type { HistoryItem, HistoryItemStatus, WorkingState } from './agent-runner-types';
export type { AgentConfig, ApprovalDecision, HistoryItem, HistoryItemStatus, StreamMode, WorkingState } from './agent-runner-types';
import { getTimeoutForTool } from '../permissions/index';

function toUiEvent(event: UpUpAgentEvent): UiEvent | undefined {
  switch (event.type) {
    case 'thinking':
      return { type: 'thinking', message: event.text };
    case 'text_delta':
      return event.delta.length === 0 ? undefined : { type: 'stream_progress', charDelta: event.delta.length, mode: 'responding', textContent: event.delta };
    case 'tool_start':
      return { type: 'tool_start', tool: event.toolName, args: (event.input ?? {}) as Record<string, unknown>, toolCallId: event.toolCallId };
    case 'tool_update':
      return { type: 'tool_progress', tool: event.toolName, message: event.text };
    case 'tool_end':
      return event.error
        ? { type: 'tool_error', tool: event.toolName, error: event.error, toolCallId: event.toolCallId }
        : { type: 'tool_end', tool: event.toolName, args: {}, result: '', duration: 0, toolCallId: event.toolCallId };
    case 'compaction_start':
      return { type: 'compaction', phase: 'start' };
    case 'compaction_end':
      return { type: 'compaction', phase: 'end', success: event.success };
    case 'run_end':
      return { type: 'done', answer: event.answer, toolCalls: [], iterations: event.iterations, totalTime: event.totalTime, tokenUsage: event.tokenUsage };
    default:
      return undefined;
  }
}

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

export interface TurnStats {
  turnStartMs: number;
  streamedChars: number;
  streamMode: StreamMode;
}

type ChangeListener = () => void;
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
type HistoryMessageListener = (msg: RenderableMessage) => void;

export interface RunQueryResult {
  answer: string;
}

export class AgentRunnerController {
  private historyValue: HistoryItem[] = [];
  private workingStateValue: WorkingState = { status: 'idle' };
  private errorValue: string | null = null;
  private pendingApprovalValue: { tool: string; args: Record<string, unknown> } | null = null;
  private turnStartMsValue: number | null = null;
  private streamedCharsValue = 0;
  private streamModeValue: StreamMode | null = null;
  private agentConfig: AgentConfig;
  private readonly inMemoryChatHistory: InMemoryChatHistory;
  private readonly ports: AgentRunnerPorts;
  private readonly onChange?: ChangeListener;
  private abortController: AbortController | null = null;
  private approvalResolve: ((decision: ApprovalDecision) => void) | null = null;
  private readonly approvalQueue: Array<{
    request: { tool: string; args: Record<string, unknown> };
    resolve: (decision: ApprovalDecision) => void;
  }> = [];
  private sessionApprovedTools = new Set<string>();
  private sessionIdValue = '';
  private historyMessageListener?: HistoryMessageListener;

  constructor(
    agentConfig: AgentConfig,
    inMemoryChatHistory: InMemoryChatHistory,
    ports: AgentRunnerPorts,
    onChange?: ChangeListener,
    sessionId?: string,
    onHistoryMessage?: HistoryMessageListener,
  ) {
    this.agentConfig = agentConfig;
    this.inMemoryChatHistory = inMemoryChatHistory;
    this.ports = ports;
    this.onChange = onChange;
    this.sessionIdValue = sessionId || '';
    this.historyMessageListener = onHistoryMessage;
  }

  get history(): HistoryItem[] {
    return this.historyValue;
  }

  get workingState(): WorkingState {
    return this.workingStateValue;
  }

  get error(): string | null {
    return this.errorValue;
  }

  get pendingApproval(): { tool: string; args: Record<string, unknown> } | null {
    return this.pendingApprovalValue;
  }

  get sessionId(): string {
    return this.sessionIdValue;
  }

  /**
   * Resume from a previous session by ID.
   * If fork=true, creates a copy with a new ID instead of resuming in place.
   */
  async resumeFromSession(sessionId: string, fork: boolean = false): Promise<string> {
    let targetId = sessionId;
    const piSessions = this.ports.sessionService;

    // Fork: create a copy with a new ID
    if (fork) {
      targetId = (await piSessions.fork(sessionId)).id;
    }
    const messages = (await piSessions.messages(targetId)).map((message, index) => ({
      id: `${targetId}-${index}`,
      type: message.type === 'toolResult' ? 'tool' : message.type,
      content: message.content,
      timestamp: Date.now() + index,
    })).filter((message) =>
      ['user', 'assistant', 'tool', 'system', 'error'].includes(message.type),
    );

    this.sessionIdValue = targetId;

    // Update session tracker
    const tracker = this.ports.sessionTracker;
    await tracker.startSession(targetId);

    // Render and display history messages (Session 2.0)
    if (messages.length > 0) {
      const rendered = this.ports.renderMessages(messages.map((message) => ({
        ...message,
        type: message.type as 'user' | 'assistant' | 'tool' | 'system',
      })));
      this.displayHistory(rendered);
    }

    // Load messages into chat history
    this.inMemoryChatHistory.clear();
    this.inMemoryChatHistory.setMessages(
      messages.map(m => ({ type: m.type, content: m.content }))
    );

    this.emitChange();
    return targetId;
  }

  get turnStats(): TurnStats | null {
    if (this.turnStartMsValue === null) return null;
    return {
      turnStartMs: this.turnStartMsValue,
      streamedChars: this.streamedCharsValue,
      streamMode: this.streamModeValue ?? 'requesting',
    };
  }

  get isProcessing(): boolean {
    return (
      this.historyValue.length > 0 && this.historyValue[this.historyValue.length - 1]?.status === 'processing'
    );
  }

  setError(error: string | null) {
    this.errorValue = error;
    this.emitChange();
  }

  get currentConfig(): Readonly<AgentConfig> {
    return this.agentConfig;
  }

  updateAgentConfig(config: Partial<Pick<AgentConfig, 'model' | 'modelProvider' | 'maxIterations'>>) {
    this.agentConfig = {
      ...this.agentConfig,
      ...config,
    };
  }

  respondToApproval(decision: ApprovalDecision) {
    if (!this.approvalResolve) {
      // 如果 approvalResolve 为 null，清理状态并恢复 UI
      this.pendingApprovalValue = null;
      this.workingStateValue = { status: 'thinking' };
      this.emitChange();
      return;
    }
    this.approvalResolve(decision);
    this.approvalResolve = null;
    this.pendingApprovalValue = null;
    if (decision !== 'deny') {
      this.workingStateValue = { status: 'thinking' };
    }
    this.emitChange();
    // Fix: 处理队列中的下一个授权请求，确保第二次授权能弹出对话框
    // 如果队列中有待处理的授权请求，processNextApproval 会设置新的 pendingApprovalValue
    // 并触发 emitChange，从而让 UI 显示第二个授权对话框
    this.processNextApproval();
  }

  cancelExecution() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.approvalResolve) {
      this.approvalResolve('deny');
      this.approvalResolve = null;
      this.pendingApprovalValue = null;
    }
    this.markLastProcessing('interrupted');
    this.workingStateValue = { status: 'idle' };
    this.resetTurnStats();
    this.emitChange();
  }

  async runQuery(query: string): Promise<RunQueryResult | undefined> {
    this.abortController = new AbortController();
    let finalAnswer: string | undefined;

    const startTime = Date.now();
    const item: HistoryItem = {
      id: String(startTime),
      query,
      events: [],
      answer: '',
      status: 'processing',
      startTime,
    };
    this.historyValue = [...this.historyValue, item];
    this.inMemoryChatHistory.saveUserQuery(query);
    this.errorValue = null;
    this.workingStateValue = { status: 'thinking' };
    this.turnStartMsValue = startTime;
    this.streamedCharsValue = 0;
    this.streamModeValue = 'requesting';
    this.emitChange();

    try {
      const piSessions = this.ports.sessionService;
      if (!this.sessionIdValue) {
        const sessionMeta = await piSessions.create({
          cwd: process.cwd(),
          firstPrompt: query.slice(0, 200),
          metadata: { projectPath: process.cwd() },
        });
        this.sessionIdValue = sessionMeta.id;

        // Initialize file history manager for this session (Phase 3 of plan11.0)
        this.ports.fileHistory.initialize(this.sessionIdValue);
      }

      // Restore approved tools from SessionTracker so they survive restarts
      const tracker = this.ports.sessionTracker;
      await tracker.startSession(this.sessionIdValue);
      const TOOLS_REQUIRING_APPROVAL = ['write_file', 'edit_file', 'bash'] as const;
      for (const tool of TOOLS_REQUIRING_APPROVAL) {
        if (tracker.isToolApproved(tool)) {
          this.sessionApprovedTools.add(tool);
        }
      }

      const stream = this.ports.stream(query, {
        ...this.agentConfig,
        signal: this.abortController.signal,
        requestToolApproval: this.requestToolApproval,
        sessionApprovedTools: this.sessionApprovedTools,
        messageQueue: this.ports.messageQueue,
        onToolApproval: (tool: string) => {
          // Keep AgentRunner's in-memory Set in sync with the executor's decisions.
          // Needed so the next run (which gets a fresh executor) inherits approved tools.
          this.sessionApprovedTools.add(tool);
        },
      }, { sessionId: this.sessionIdValue, inMemoryHistory: this.inMemoryChatHistory });
      for await (const event of stream) {
        if (event.type === 'run_end') {
          finalAnswer = event.answer;
        }
        await this.handleEvent(event);
      }

      // Post-run: if messages arrived after the agent's last drain, start a new turn
      if (!this.ports.messageQueue.isEmpty()) {
        const remaining = this.ports.messageQueue.dequeueAll();
        const mergedText = remaining.map(m => m.text).join('\n\n');
        return this.runQuery(mergedText);
      }

      // Record file history snapshot for file recovery (Phase 3 of plan11.0)
      if (this.sessionIdValue) {
        const itemId = String(startTime);
        try {
          this.ports.fileHistory.record(itemId, this.sessionIdValue);
        } catch (err) {
          console.error('[agent-runner] Failed to record file history snapshot:', err);
        }
      }

      if (finalAnswer) {
        return { answer: finalAnswer };
      }
      return undefined;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        this.markLastProcessing('interrupted');
        this.workingStateValue = { status: 'idle' };
        this.resetTurnStats();
        this.emitChange();
        return undefined;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.errorValue = message;
      this.markLastProcessing('error');
      this.workingStateValue = { status: 'idle' };
      this.resetTurnStats();
      this.emitChange();
      return undefined;
    } finally {
      this.abortController = null;
    }
  }

  private resetTurnStats() {
    this.turnStartMsValue = null;
    this.streamedCharsValue = 0;
    this.streamModeValue = null;
  }

  private requestToolApproval = (request: { tool: string; args: Record<string, unknown> }) => {
    return new Promise<ApprovalDecision>((resolve) => {
      // 如果已有 pendingApproval，加入队列等待
      if (this.pendingApprovalValue !== null) {
        this.approvalQueue.push({ request, resolve });
        return;
      }

      // 处理当前授权请求
      const timeoutMs = getTimeoutForTool(request.tool);
      const timeout = setTimeout(() => {
        resolve('deny');
        this.processNextApproval();
      }, timeoutMs);

      this.approvalResolve = (decision: ApprovalDecision) => {
        clearTimeout(timeout);
        resolve(decision);
        // 处理队列中的下一个授权请求
        this.processNextApproval();
      };
      this.pendingApprovalValue = request;
      this.workingStateValue = { status: 'approval', toolName: request.tool };
      this.emitChange();
    });
  };

  /**
   * 处理队列中的下一个授权请求
   */
  private processNextApproval() {
    const next = this.approvalQueue.shift();
    if (next) {
      const timeoutMs = getTimeoutForTool(next.request.tool);
      const timeout = setTimeout(() => {
        next.resolve('deny');
        this.processNextApproval();
      }, timeoutMs);

      this.approvalResolve = (decision: ApprovalDecision) => {
        clearTimeout(timeout);
        next.resolve(decision);
        this.processNextApproval();
      };
      this.pendingApprovalValue = next.request;
      this.workingStateValue = { status: 'approval', toolName: next.request.tool };
      this.emitChange();
    } else {
      this.approvalResolve = null;
      this.pendingApprovalValue = null;
      this.workingStateValue = { status: 'thinking' };
      this.emitChange();
    }
  }

  private async handleEvent(event: UpUpAgentEvent) {
    const uiEvent = toUiEvent(event);
    if (!uiEvent) return;
    switch (uiEvent.type) {
      case 'thinking':
        this.workingStateValue = { status: 'thinking' };
        this.pushEvent({
          id: `thinking-${Date.now()}`,
          event: uiEvent,
          completed: true,
        });
        break;
      case 'tool_start': {
        const toolId = uiEvent.toolCallId ?? `tool-${uiEvent.tool}-${Date.now()}`;
        this.workingStateValue = { status: 'tool', toolName: uiEvent.tool };
        this.updateLastItem((last) => ({
          ...last,
          activeToolId: toolId,
          events: [
            ...last.events,
            {
              id: toolId,
              event: uiEvent,
              completed: false,
            } as DisplayEvent,
          ],
        }));
        break;
      }
      case 'tool_progress':
        this.updateLastItem((last) => ({
          ...last,
          events: last.events.map((entry) =>
            entry.id === last.activeToolId ? { ...entry, progressMessage: uiEvent.message } : entry,
          ),
        }));
        break;
      case 'tool_end': {
        const endToolId = uiEvent.toolCallId ?? this.getLastItem()?.activeToolId;
        this.updateLastItem((last) => ({
          ...last,
          events: last.events.map((entry) =>
            entry.id === endToolId ? { ...entry, completed: true, endEvent: uiEvent } : entry,
          ),
        }));
        this.workingStateValue = { status: 'thinking' };

        break;
      }
      case 'tool_error': {
        const errToolId = uiEvent.toolCallId ?? this.getLastItem()?.activeToolId;
        this.updateLastItem((last) => ({
          ...last,
          events: last.events.map((entry) =>
            entry.id === errToolId ? { ...entry, completed: true, endEvent: uiEvent } : entry,
          ),
        }));
        this.workingStateValue = { status: 'thinking' };

        break;
      }
      case 'tool_approval':
        this.pushEvent({
          id: `approval-${uiEvent.tool}-${Date.now()}`,
          event: uiEvent,
          completed: true,
        });
        break;
      case 'tool_denied':
        this.pushEvent({
          id: `denied-${uiEvent.tool}-${Date.now()}`,
          event: uiEvent,
          completed: true,
        });
        break;
      case 'tool_limit':
      case 'context_cleared':
      case 'compaction':
      case 'microcompact':
      case 'queue_drain':
      case 'memory_flush':
      case 'memory_recalled':
        this.pushEvent({
          id: `${uiEvent.type}-${Date.now()}`,
          event: uiEvent,
          completed: true,
        });
        break;
      case 'stream_progress':
        // Update accumulators without firing onChange — the working indicator
        // pulls turnStats on its own spinner tick. Avoids a per-chunk emitChange
        // storm that stutters input.
        this.streamedCharsValue += uiEvent.charDelta;
        this.streamModeValue = uiEvent.mode;
        return;
      case 'done': {
        const done = uiEvent as DoneEvent;
        if (done.answer) {
          await this.inMemoryChatHistory.saveAnswer(done.answer).catch(() => {});
        }
        this.updateLastItem((last) => ({
          ...last,
          answer: done.answer,
          status: 'complete',
          duration: done.totalTime,
          tokenUsage: done.tokenUsage,
          tokensPerSecond: done.tokensPerSecond,
        }));
        this.workingStateValue = { status: 'idle' };
        this.resetTurnStats();
        break;
      }
    }
    this.emitChange();
  }

  private pushEvent(displayEvent: DisplayEvent) {
    this.updateLastItem((last) => ({ ...last, events: [...last.events, displayEvent] }));
  }

  private getLastItem(): HistoryItem | undefined {
    return this.historyValue[this.historyValue.length - 1];
  }

  private updateLastItem(updater: (item: HistoryItem) => HistoryItem) {
    const last = this.historyValue[this.historyValue.length - 1];
    if (!last || last.status !== 'processing') {
      return;
    }
    const next = updater(last);
    this.historyValue = [...this.historyValue.slice(0, -1), next];
  }

  private markLastProcessing(status: HistoryItemStatus) {
    const last = this.historyValue[this.historyValue.length - 1];
    if (!last || last.status !== 'processing') {
      return;
    }
    this.historyValue = [...this.historyValue.slice(0, -1), { ...last, status }];
  }

  private emitChange() {
    this.onChange?.();
  }

  /**
   * Display history messages via listener callback
   * Used by Session 2.0 to render previous conversation
   */
  private displayHistory(messages: RenderableMessage[]): void {
    if (!this.historyMessageListener) {
      // No listener - silently skip (backward compatible)
      return;
    }

    for (const msg of messages) {
      try {
        this.historyMessageListener(msg);
      } catch (err) {
        // Non-critical: don't fail resume if history display fails
        console.error('[agent-runner] Failed to display history message:', err);
      }
    }
  }
}
