import { Agent } from '../agent/agent.js';
import type { InMemoryChatHistory } from '../utils/in-memory-chat-history.js';
import { defaultQueue } from '../utils/message-queue.js';
import type {
  AgentConfig,
  AgentEvent,
  ApprovalDecision,
  DoneEvent,
} from '../agent/index.js';
import type { DisplayEvent, StreamMode } from '../agent/types.js';
import type { HistoryItem, HistoryItemStatus, WorkingState } from '../types.js';
import { getSessionTracker } from '../session/session-tracker.js';
import { createSession, addSessionMessage } from '../session/storage.js';
import { recordFileHistorySnapshot, getFileHistoryManager } from '../storage/file-history.js';

export interface TurnStats {
  turnStartMs: number;
  streamedChars: number;
  streamMode: StreamMode;
}

type ChangeListener = () => void;

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
  private readonly onChange?: ChangeListener;
  private abortController: AbortController | null = null;
  private approvalResolve: ((decision: ApprovalDecision) => void) | null = null;
  private sessionApprovedTools = new Set<string>();
  private sessionIdValue = '';

  constructor(
    agentConfig: AgentConfig,
    inMemoryChatHistory: InMemoryChatHistory,
    onChange?: ChangeListener,
    sessionId?: string,
  ) {
    this.agentConfig = agentConfig;
    this.inMemoryChatHistory = inMemoryChatHistory;
    this.onChange = onChange;
    this.sessionIdValue = sessionId || '';
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

    // Fork: create a copy with a new ID
    if (fork) {
      const { forkSession } = await import('../session/storage.js');
      const newId = await forkSession(sessionId);
      if (!newId) {
        throw new Error(`Failed to fork session: ${sessionId}`);
      }
      targetId = newId;
    }

    const { loadSessionForResume, processResumedConversation } = await import('../session/restore.js');
    const result = await loadSessionForResume(targetId);
    if (!result) {
      throw new Error(`Session not found: ${targetId}`);
    }

    const processed = await processResumedConversation(targetId);
    if (!processed) {
      throw new Error(`Failed to process session: ${targetId}`);
    }

    this.sessionIdValue = targetId;

    // Update session tracker
    const tracker = getSessionTracker();
    await tracker.startSession(targetId);

    // Load messages into chat history
    this.inMemoryChatHistory.clear();
    this.inMemoryChatHistory.setMessages(
      processed.messages.map(m => ({ type: m.type, content: m.content }))
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
      return;
    }
    this.approvalResolve(decision);
    this.approvalResolve = null;
    this.pendingApprovalValue = null;
    if (decision !== 'deny') {
      this.workingStateValue = { status: 'thinking' };
    }
    this.emitChange();
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
      // Create a new session using storage.ts (Phase 1 of plan11.0)
      if (!this.sessionIdValue) {
        const sessionMeta = await createSession({
          projectPath: process.cwd(),
          firstPrompt: query.slice(0, 200),
        });
        this.sessionIdValue = sessionMeta.id;

        // Initialize file history manager for this session (Phase 3 of plan11.0)
        const fileHistoryMgr = getFileHistoryManager(this.sessionIdValue);
        fileHistoryMgr.setSessionId(this.sessionIdValue);
      }

      // Save user message
      await addSessionMessage(this.sessionIdValue, {
        type: 'user',
        content: query,
      }, process.cwd());

      // Restore approved tools from SessionTracker so they survive restarts
      const tracker = getSessionTracker();
      await tracker.startSession(this.sessionIdValue);
      const TOOLS_REQUIRING_APPROVAL = ['write_file', 'edit_file'] as const;
      for (const tool of TOOLS_REQUIRING_APPROVAL) {
        if (tracker.isToolApproved(tool)) {
          this.sessionApprovedTools.add(tool);
        }
      }

      const agent = await Agent.create({
        ...this.agentConfig,
        signal: this.abortController.signal,
        requestToolApproval: this.requestToolApproval,
        sessionApprovedTools: this.sessionApprovedTools,
        messageQueue: defaultQueue,
        onToolApproval: (tool: string) => {
          // Keep AgentRunner's in-memory Set in sync with the executor's decisions.
          // Needed so the next run (which gets a fresh executor) inherits approved tools.
          this.sessionApprovedTools.add(tool);
        },
      });
      const stream = agent.run(query, this.inMemoryChatHistory);
      for await (const event of stream) {
        if (event.type === 'done') {
          finalAnswer = (event as DoneEvent).answer;
        }
        await this.handleEvent(event);
      }

      // Post-run: if messages arrived after the agent's last drain, start a new turn
      if (!defaultQueue.isEmpty()) {
        const remaining = defaultQueue.dequeueAll();
        const mergedText = remaining.map(m => m.text).join('\n\n');
        return this.runQuery(mergedText);
      }

      // Save assistant response to session
      if (finalAnswer && this.sessionIdValue) {
        await addSessionMessage(this.sessionIdValue, {
          type: 'assistant',
          content: finalAnswer,
        }, process.cwd());
      }

      // Record file history snapshot for file recovery (Phase 3 of plan11.0)
      if (this.sessionIdValue) {
        const itemId = String(startTime);
        try {
          recordFileHistorySnapshot(itemId, this.sessionIdValue);
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
      this.approvalResolve = resolve;
      this.pendingApprovalValue = request;
      this.workingStateValue = { status: 'approval', toolName: request.tool };
      this.emitChange();
    });
  };

  private async handleEvent(event: AgentEvent) {
    switch (event.type) {
      case 'thinking':
        this.workingStateValue = { status: 'thinking' };
        this.pushEvent({
          id: `thinking-${Date.now()}`,
          event,
          completed: true,
        });
        break;
      case 'tool_start': {
        const toolId = event.toolCallId ?? `tool-${event.tool}-${Date.now()}`;
        this.workingStateValue = { status: 'tool', toolName: event.tool };
        this.updateLastItem((last) => ({
          ...last,
          activeToolId: toolId,
          events: [
            ...last.events,
            {
              id: toolId,
              event,
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
            entry.id === last.activeToolId ? { ...entry, progressMessage: event.message } : entry,
          ),
        }));
        break;
      case 'tool_end': {
        const endToolId = event.toolCallId ?? this.getLastItem()?.activeToolId;
        this.updateLastItem((last) => ({
          ...last,
          events: last.events.map((entry) =>
            entry.id === endToolId ? { ...entry, completed: true, endEvent: event } : entry,
          ),
        }));
        this.workingStateValue = { status: 'thinking' };
        break;
      }
      case 'tool_error': {
        const errToolId = event.toolCallId ?? this.getLastItem()?.activeToolId;
        this.updateLastItem((last) => ({
          ...last,
          events: last.events.map((entry) =>
            entry.id === errToolId ? { ...entry, completed: true, endEvent: event } : entry,
          ),
        }));
        this.workingStateValue = { status: 'thinking' };
        break;
      }
      case 'tool_approval':
        this.pushEvent({
          id: `approval-${event.tool}-${Date.now()}`,
          event,
          completed: true,
        });
        break;
      case 'tool_denied':
        this.pushEvent({
          id: `denied-${event.tool}-${Date.now()}`,
          event,
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
          id: `${event.type}-${Date.now()}`,
          event,
          completed: true,
        });
        break;
      case 'stream_progress':
        // Update accumulators without firing onChange — the working indicator
        // pulls turnStats on its own spinner tick. Avoids a per-chunk emitChange
        // storm that stutters input.
        this.streamedCharsValue += event.charDelta;
        this.streamModeValue = event.mode;
        return;
      case 'done': {
        const done = event as DoneEvent;
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
}
