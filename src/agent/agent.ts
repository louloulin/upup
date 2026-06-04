import { AIMessage, AIMessageChunk, SystemMessage, HumanMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { StructuredToolInterface } from '@langchain/core/tools';
import { callLlmWithMessages, streamLlmWithMessages } from '../model/llm.js';
// Lazy import to avoid circular dependency with tools/finance → agent/prompts → tools/registry
// import { getTools, getToolConcurrencyMap } from '../tools/registry/index.js';
import { buildSystemPrompt, loadSoulDocument, loadRulesDocument } from './prompts.js';
import { extractTextContent, hasToolCalls } from '../utils/ai-message.js';
import { InMemoryChatHistory } from '../utils/in-memory-chat-history.js';
import { estimateTokens, getAutoCompactThreshold, KEEP_TOOL_USES } from '../utils/tokens.js';
import { exceedsSizeCap, persistLargeResult, buildPersistedContent } from '../utils/tool-result-storage.js';
import { enforceResultBudget } from '../utils/tool-result-budget.js';
import { formatUserFacingError, isContextOverflowError } from '../utils/errors.js';
import type { AgentConfig, AgentEvent, CompactionEvent, ContextClearedEvent, MicrocompactEvent, QueueDrainEvent, StreamMode, StreamProgressEvent, TokenUsage } from '../agent/types.js';
import type { MessageQueue } from '../utils/message-queue.js';
import { compactContext, MAX_CONSECUTIVE_COMPACTION_FAILURES, MIN_TOOL_RESULTS_FOR_COMPACTION } from './compact.js';
import { microcompactMessages } from './microcompact.js';
import { useContextWatchdog, useMemoryUsage, useSessionBackgrounding, useToolMetrics, useSessionRecovery } from '../hooks/agent-hooks.js';
import { createRunContext, type RunContext } from './run-context.js';
import { AgentToolExecutor } from './tool-executor.js';
import { getLoopDetector, resetLoopDetector, type RecoveryStrategy } from './loop-recovery.js';
import { getSessionTracker } from '../session/session-tracker.js';
import { getPlanModeState } from './plan-mode-state.js';
import { maybeEnterPlanMode, type PlanAutoTriggerResult } from './plan-auto-trigger.js';
import { recordToolCallOk, recordToolCallErr } from '../telemetry/integration.js';
import { MemoryManager } from '../memory/index.js';
import { runMemoryFlush, shouldRunMemoryFlush } from '../memory/flush.js';
import { createExtractionHook, type ExtractionResult } from '../memory/extraction.js';
import { getObservationBuffer } from '../memory/observation-buffer.js';
import { getStopHookRegistry, registerDefaultStopHooks, type StopHookContext } from '../hooks/stop-hooks.js';
import { isFeatureEnabled } from '../utils/feature-flags.js';
import { resolveProvider } from '../providers.js';
import { warn, error, info, debug, perf } from '../utils/logging/logger.js';
import { ModelFallbackHandler, FallbackTriggeredError, isFallbackError } from './fallback.js';
import { getConfiguredModelId, getConfiguredProvider } from '../utils/config.js';

const DEFAULT_MAX_ITERATIONS = 50;
const MAX_OVERFLOW_RETRIES = 2;
const OVERFLOW_KEEP_ROUNDS = 3;

// ============================================================================
// Types
// ============================================================================

/**
 * Agent run options
 */
export interface AgentRunOptions {
  /** Session ID for associating this run with a persistent session */
  sessionId?: string;
  /** In-memory chat history */
  inMemoryHistory?: InMemoryChatHistory;
}

/**
 * The core agent class that handles the agent loop and tool execution.
 *
 * Architecture:
 * - Growing message array with full reasoning continuity
 * - Concurrent execution for read-only tools
 * - Streaming LLM responses with fallback to blocking
 * - Per-turn microcompact + threshold-based full compaction
 */
/**
 * v7-1: Format an auto-triggered plan as a SystemMessage summary for the LLM.
 * Kept module-private (not exported) since it is a UI/internal concern.
 * Injects the plan id, ticker, phases, primary intent so the LLM can
 * reference the plan on the next iteration and follow plan-mode tool rules.
 */
function formatAutoPlanSummary(trigger: PlanAutoTriggerResult): string {
  if (!trigger.triggered || !trigger.plan) return "";
  const lines: string[] = [
    "[AUTO-PLAN-MODE]",
    "An auto-built ResearchPlan was created for the user query.",
    "",
    "Plan ID: " + trigger.plan.id,
    "Ticker: " + (trigger.ticker ?? "(not specified)"),
    "Phases: " + (trigger.phases?.join(" -> ") ?? "(none)"),
    "Steps: " + trigger.plan.steps.length,
    "Primary Intent: " + (trigger.primaryIntent ?? "keyword-fallback"),
    "",
    "Plan mode is now ACTIVE. Only plan-related tools (enter_plan_mode, exit_plan_mode,",
    "add_plan_step, update_plan_step, list_plan_steps, get_plan) are allowed until the",
    "user calls exit_plan_mode or confirms the plan via confirmPlan.",
    "",
    "If the user wants to proceed, summarize the plan and ask for confirmation.",
    "If the user wants to modify it, use add_plan_step / update_plan_step.",
  ];
  return lines.join("\n");
}

export class Agent {
  private readonly model: string;
  private readonly maxIterations: number;
  private readonly tools: StructuredToolInterface[];
  private readonly toolMap: Map<string, StructuredToolInterface>;
  private readonly toolExecutor: AgentToolExecutor;
  private readonly systemPrompt: string;
  private readonly signal?: AbortSignal;
  private readonly memoryEnabled: boolean;
  private readonly messageQueue?: MessageQueue;
  private readonly extractionHook: (messages: { role: string; content: string }[], signal?: AbortSignal) => Promise<ExtractionResult[]>;
  private readonly sessionId: string;
  private turnCount: number = 0;
  private compactionFailures: number = 0;
  private readonly fallbackHandler: ModelFallbackHandler;
  private accumulatedText: string = ''; // 累积完整文本用于 SDK query() 返回

  private constructor(
    config: AgentConfig,
    tools: StructuredToolInterface[],
    systemPrompt: string,
    concurrencyMap: Map<string, boolean>,
  ) {
    this.model = config.model ?? getConfiguredModelId();
    this.maxIterations = config.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.tools = tools;
    this.toolMap = new Map(tools.filter(t => t?.name).map(t => [t!.name, t!]));
    this.toolExecutor = new AgentToolExecutor(
      this.toolMap,
      concurrencyMap,
      config.signal,
      config.requestToolApproval,
      config.sessionApprovedTools,
      undefined, // maxConcurrency unused
      config.onToolApproval,
    );
    this.systemPrompt = systemPrompt;
    this.signal = config.signal;
    this.memoryEnabled = config.memoryEnabled ?? true;
    this.messageQueue = config.messageQueue;
    this.sessionId = config.sessionId ?? `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.turnCount = 0;
    this.extractionHook = createExtractionHook({
      minTurnsBetweenExtractions: 5,
      maxMemoriesPerExtraction: 3,
    });
    this.fallbackHandler = new ModelFallbackHandler({ primaryModel: this.model });

    // Register default stop hooks
    if (isFeatureEnabled('dexter_stop_hooks_enabled')) {
      registerDefaultStopHooks();
    }
  }

  static async create(config: AgentConfig = {}): Promise<Agent> {
    const model = config.model ?? getConfiguredModelId();
    // Lazy import to break circular dependency
    const { getTools, getToolConcurrencyMap } = await import('../tools/registry/index.js');
    let tools = await getTools(model);
    let concurrencyMap = await getToolConcurrencyMap(model);

    // Apply tool filter if specified (for sub-agents with restricted tool access)
    if (config.toolFilter && config.toolFilter !== '*' && config.toolFilter.length > 0) {
      const allowed = new Set(config.toolFilter);
      tools = tools.filter(t => t?.name && allowed.has(t.name));
      // Filter concurrency map to only include allowed tools
      const filteredMap = new Map<string, boolean>();
      for (const [name, isConcurrent] of concurrencyMap) {
        if (allowed.has(name)) filteredMap.set(name, isConcurrent);
      }
      concurrencyMap = filteredMap;
    }

    const soulContent = await loadSoulDocument();
    const rulesContent = await loadRulesDocument();
    let memoryFiles: string[] = [];
    let memoryContext: string | null = null;

    if (config.memoryEnabled !== false) {
      const memoryManager = await MemoryManager.get();
      memoryFiles = await memoryManager.listFiles();
      const session = await memoryManager.loadSessionContext();
      if (session.text.trim()) {
        memoryContext = session.text;
      }
    }

    const systemPrompt = await buildSystemPrompt(
      model,
      soulContent,
      config.channel,
      config.groupContext,
      memoryFiles,
      memoryContext,
      rulesContent,
    );
    return new Agent(config, tools, systemPrompt, concurrencyMap);
  }

  /**
   * Run the agent with streaming, concurrent tools, and microcompact.
   */
  async *run(query: string, options?: AgentRunOptions): AsyncGenerator<AgentEvent> {
    const startTime = Date.now();

    // Reset accumulated text for this run
    this.accumulatedText = '';

    // Use provided sessionId or generate a new one
    const sessionId = options?.sessionId || `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Reset per-run state to prevent cross-session contamination
    this.compactionFailures = 0;
    resetLoopDetector();

    // Load user hooks on first run (non-blocking, idempotent)
    try {
      const { loadUserHooks } = await import('../hooks/user-hooks.js');
      loadUserHooks().catch(() => {}); // fire and forget
    } catch { /* user hooks not available */ }

    // Log agent start
    const queryPreview = query.length > 100 ? query.substring(0, 100) + '...' : query;
    info('agent', `Agent started: "${queryPreview}"`);

    if (this.tools.length === 0) {
      info('agent', 'No tools available');
      yield { type: 'done', answer: 'No tools available. Please check your API key configuration.', toolCalls: [], iterations: 0, totalTime: Date.now() - startTime };
      return;
    }

    const ctx = createRunContext(query);
    const memoryFlushState = { alreadyFlushed: false };

    // Build initial message array
    const inMemoryHistory = options?.inMemoryHistory;
    const historyMessages = inMemoryHistory?.getRecentTurnsAsMessages() ?? [];

    // Initialize daemon session for persistent cross-restart state
    let daemonSession: import('../daemon/session.js').AgentSession | null = null;
    let daemonSessionManager: import('../daemon/session.js').SessionManager | null = null;
    let existingSessionMessages: BaseMessage[] = [];

    try {
      const { getSessionManager: getDaemonSessionManager, deserializeMessage } = await import('../daemon/session.js');
      daemonSessionManager = getDaemonSessionManager();
      daemonSession = await daemonSessionManager.create({
        id: sessionId,
        context: {
          projectSlug: process.cwd().split('/').pop() ?? 'unknown',
          projectPath: process.cwd(),
          model: this.model,
        },
      });
      await daemonSessionManager.startSession(sessionId);

      // Load existing messages from daemonSession for conversation continuity
      if (daemonSession.messages && daemonSession.messages.length > 0) {
        existingSessionMessages = daemonSession.messages
          .map(msg => deserializeMessage(msg))
          .filter(msg => msg.content); // Skip empty messages
        info('agent', `Loaded ${existingSessionMessages.length} messages from session ${sessionId}`);
      }
    } catch (err) {
      // Daemon session is optional — agent runs fine without it
      warn('agent', `Failed to initialize daemon session: ${err}`);
    }

    let messages: BaseMessage[] = [
      new SystemMessage(this.systemPrompt),
      ...historyMessages,
      ...existingSessionMessages,
      new HumanMessage(query),
    ];

    // v7-1: Auto-trigger plan mode from user intent (claude code AI capability)
    // Bridges user query to plan-builder + plan-mode-state. Non-blocking:
    // any failure (no intent, detector unavailable, build error) silently
    // skips, agent loop continues with original behavior.
    try {
      const trigger = await maybeEnterPlanMode(query);
      if (trigger.triggered && trigger.plan) {
        // Inject a SystemMessage summarizing the auto-built plan so the LLM
        // sees it on the next iteration. The plan itself was already built
        // and persisted by the trigger; this just informs the LLM.
        const planSummary = formatAutoPlanSummary(trigger);
        messages.push(new SystemMessage(planSummary));
        info('agent', `Auto-entered plan mode: ${trigger.plan.id} (intent=${trigger.primaryIntent ?? 'keyword'}, ticker=${trigger.ticker ?? 'n/a'}, phases=${trigger.phases?.join(',') ?? '?'})`);
      }
    } catch (err) {
      warn('agent', `plan-auto-trigger failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
    }

    // Main agent loop
    let overflowRetries = 0;

    // Initialize context watchdog for proactive context monitoring
    const watchdog = useContextWatchdog();
    let watchdogActive = false;

    // Initialize memory monitor for system health tracking
    const memoryMonitor = useMemoryUsage();
    memoryMonitor.on('warning', (stats) => {
      warn('agent', `Memory warning: heap at ${((stats.heapUsed / stats.heapTotal) * 100).toFixed(1)}%`);
    });
    memoryMonitor.on('critical', (stats) => {
      warn('agent', `Memory critical: heap at ${((stats.heapUsed / stats.heapTotal) * 100).toFixed(1)}% — consider compacting`);
    });
    memoryMonitor.start(10000); // Poll every 10 seconds

    // Initialize session backgrounding for idle session management
    const bgSession = useSessionBackgrounding();
    bgSession.create(sessionId, { model: this.model, startTime });

    // Initialize tool metrics collector
    const metrics = useToolMetrics();

    // Initialize session recovery for auto-save
    const recovery = useSessionRecovery(30000);
    recovery.on('session_saved', ({ sessionId: sid }) => {
      info('agent', `Session auto-saved: ${sid}`);
    });
    recovery.start(() => {
      // Auto-save callback: persist current context state
      const ctxSnapshot = {
        iteration: ctx.iteration,
        toolCalls: ctx.scratchpad.getToolCallRecords().length,
        tokens: ctx.tokenCounter.getUsage()?.totalTokens ?? 0,
      };
      recovery.saveSession(sessionId, ctxSnapshot).catch(() => {});
    });

    // Cleanup function for when agent loop finishes
    const cleanup = async () => {
      memoryMonitor.stop();
      recovery.stop();
      bgSession.background(sessionId);
      // Complete daemon session if active
      if (daemonSession && daemonSessionManager) {
        try {
          // Serialize and save messages to daemonSession for conversation continuity
          const { serializeMessage } = await import('../daemon/session.js');
          // Filter to only save essential messages for context continuity:
          // - HumanMessage (user queries)
          // - AIMessage with text content (not tool calls)
          // Skip: SystemMessage, ToolMessage, empty AIMessages
          const messagesToSave = messages.filter(msg => {
            if (msg instanceof SystemMessage) return false; // Skip system prompt
            if (msg instanceof ToolMessage) return false; // Skip tool results (they need tool_call_id)
            // Keep human messages
            if (msg.getType() === 'human') return true;
            // Keep AI messages with text content
            if (msg.getType() === 'ai') {
              const content = typeof msg.content === 'string' ? msg.content : '';
              const toolCalls = (msg as any).tool_calls;
              // 只要有文本内容就保存（包括有 tool_calls 的消息）
              return content.trim().length > 0;
            }
            return false;
          });
          const serializedMessages = messagesToSave.map(msg => serializeMessage(msg));

          // Merge with existing messages (avoid duplicates)
          // 使用更宽松的去重逻辑：检查前 100 字符
          const existingIds = new Set(
            daemonSession.messages.map(m => `${m.type}:${m.content.substring(0, 100)}`)
          );
          const newMessages = serializedMessages.filter(m => {
            const key = `${m.type}:${m.content.substring(0, 100)}`;
            return !existingIds.has(key);
          });

          if (newMessages.length > 0) {
            await daemonSessionManager.update(sessionId, {
              messages: [...daemonSession.messages, ...newMessages],
            } as any);
            info('agent', `Saved ${newMessages.length} new messages to session ${sessionId}`);
          }

          await daemonSessionManager.complete(sessionId);
        } catch (err) {
          warn('agent', `Failed to save session messages: ${err}`);
        }
      }
      // Emit final metrics summary
      const finalMetrics = metrics.getMetrics();
      if (finalMetrics.totalCalls > 0) {
        perf('agent', `Tool metrics: ${finalMetrics.totalCalls} calls, ${(finalMetrics.successRate * 100).toFixed(1)}% success, avg ${(finalMetrics.avgDuration).toFixed(0)}ms`, 0);
      }
    };

    // Initialize loop detector for repeated action detection
    const loopDetector = getLoopDetector({ minRepetitions: 3, historyWindow: 20 });

    try {
    while (ctx.iteration < this.maxIterations) {
      ctx.iteration++;

      // Microcompact: per-turn lightweight trimming before LLM call
      const mcResult = microcompactMessages(messages);
      if (mcResult.trigger) {
        messages = mcResult.messages;
        yield { type: 'microcompact', cleared: mcResult.cleared, tokensSaved: mcResult.estimatedTokensSaved } as MicrocompactEvent;
      }

      // Update context watchdog with current token estimate
      const currentTokens = estimateTokens(messages as any);
      const check = watchdog.check();

      // Start watchdog if we detect high context usage (>50% of limit)
      if (!watchdogActive && check.percent > 0.5) {
        watchdogActive = true;
        info('agent', `Context watchdog activated at ${(check.percent * 100).toFixed(1)}% usage`);
      }

      if (watchdogActive) {
        const prevStatus = check.status;
        watchdog.setTokenCount(currentTokens);
        const newCheck = watchdog.check();

        // Log status changes
        if (newCheck.status !== prevStatus) {
          info('agent', `Context watchdog: ${prevStatus} → ${newCheck.status} (${(newCheck.percent * 100).toFixed(1)}%)`);
        }

        // Emit compaction event if critical
        if (newCheck.status === 'critical' && prevStatus !== 'critical') {
          yield { type: 'compaction', phase: 'start', reason: 'context_critical', usage: newCheck.usage, limit: newCheck.limit } as unknown as CompactionEvent;
        }
      }

      // Strip old reasoning from AIMessages (keep last 2 for continuity)
      this.stripOldThinking(messages, 2);

      let response: AIMessage;
      let usage: TokenUsage | undefined;

      // Call LLM with streaming (falls back to blocking on error)
      while (true) {
        try {
          const result = yield* this.callModelWithStreaming(messages);
          response = result.response;
          usage = result.usage;
          overflowRetries = 0;
          break;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          if (isContextOverflowError(errorMessage) && overflowRetries < MAX_OVERFLOW_RETRIES) {
            overflowRetries++;
            const removed = this.truncateMessages(messages, OVERFLOW_KEEP_ROUNDS);
            if (removed > 0) {
              yield { type: 'context_cleared', clearedCount: removed, keptCount: OVERFLOW_KEEP_ROUNDS };
              continue;
            }
          }

          const totalTime = Date.now() - ctx.startTime;
          const provider = resolveProvider(this.model).displayName;
          yield {
            type: 'done',
            answer: `Error: ${formatUserFacingError(errorMessage, provider)}`,
            toolCalls: ctx.scratchpad.getToolCallRecords(),
            iterations: ctx.iteration,
            totalTime,
            tokenUsage: ctx.tokenCounter.getUsage(),
            tokensPerSecond: ctx.tokenCounter.getTokensPerSecond(totalTime),
          };
          return;
        }
      }

      ctx.tokenCounter.add(usage);
      if (usage?.inputTokens) {
        ctx.lastApiInputTokens = usage.inputTokens;
        // Sync token usage to AppState for /cost and /status commands
        try {
          const { getAppState, calculateTokenCost } = await import('../state/index.js');
          const appState = getAppState();
          appState.addTokens(usage.inputTokens, usage.outputTokens);
          const cost = calculateTokenCost(usage.inputTokens, usage.outputTokens, this.model);
          appState.addCost(cost);
        } catch { /* non-critical — cost tracking best-effort */ }
      }

      const responseText = extractTextContent(response);

      // Emit thinking if there are also tool calls
      if (responseText?.trim() && hasToolCalls(response)) {
        const trimmedText = responseText.trim();
        ctx.scratchpad.addThinking(trimmedText);
        yield { type: 'thinking', message: trimmedText };
      }

      // No tool calls = final answer
      if (!hasToolCalls(response)) {
        yield* this.handleDirectResponse(responseText ?? '', ctx, messages);
        return;
      }

      // Push AIMessage to conversation history
      messages.push(response);

      // Execute tools concurrently where safe, collect ToolMessages by ID
      let { toolMessages, denied } = yield* this.executeToolsAndCollectMessages(response, ctx);

      // Cap large results (persist to disk, inject preview)
      toolMessages = toolMessages.map(tm => {
        const content = typeof tm.content === 'string' ? tm.content : JSON.stringify(tm.content);
        if (exceedsSizeCap(content)) {
          const { preview, filePath } = persistLargeResult(tm.name ?? 'unknown', tm.tool_call_id, content);
          return new ToolMessage({
            content: buildPersistedContent(filePath, preview, content.length),
            tool_call_id: tm.tool_call_id,
            name: tm.name,
          });
        }
        return tm;
      });

      // Enforce per-turn total budget
      toolMessages = enforceResultBudget(toolMessages);

      messages.push(...toolMessages);

      // Persist session after each tool batch for crash recovery
      try {
        const sessionTracker = getSessionTracker();
        ctx.scratchpad.getToolCallRecords().forEach(tc => sessionTracker.recordToolCall(tc.tool));
        sessionTracker.updateTokens(ctx.tokenCounter.getUsage()?.totalTokens ?? 0);
        await sessionTracker.persist();
      } catch {
        // Non-critical: session persistence failure should not block agent
      }

      // Update daemon session metadata after tool execution
      if (daemonSession) {
        try {
          const { getSessionManager: getDaemonSessionManager } = await import('../daemon/session.js');
          const daemonMgr = getDaemonSessionManager();
          await daemonMgr.update(sessionId, {
            metadata: {
              turnCount: ctx.iteration,
              toolUseCount: ctx.scratchpad.getToolCallRecords().length,
              tokenUsage: {
                input: ctx.tokenCounter.getUsage()?.inputTokens ?? 0,
                output: ctx.tokenCounter.getUsage()?.outputTokens ?? 0,
              },
            },
          } as any);
        } catch {
          // Non-critical
        }
      }

      // Loop detection: record tools used and check for repeated actions
      const toolsUsed = response.tool_calls?.map(tc => tc.name ?? 'unknown').join(',') ?? 'no-tools';
      loopDetector.recordAction(toolsUsed);
      const loopCheck = loopDetector.detect();

      if (loopCheck.isLooping) {
        warn('agent', `Loop detected: ${loopCheck.type} (confidence: ${loopCheck.confidence.toFixed(2)}, repetitions: ${loopCheck.repetitions})`);

        // If circuit breaker is open, abort
        if (loopDetector.isCircuitBreakerOpen()) {
          const totalTime = Date.now() - ctx.startTime;
          yield {
            type: 'done',
            answer: 'Agent detected a repetitive loop and halted to prevent further iterations. Please try a different approach.',
            toolCalls: ctx.scratchpad.getToolCallRecords(),
            iterations: ctx.iteration,
            totalTime,
            tokenUsage: ctx.tokenCounter.getUsage(),
            tokensPerSecond: ctx.tokenCounter.getTokensPerSecond(totalTime),
          };
          return;
        }

        // Inject warning into context
        const loopWarning = `[Loop Warning] Detected repetitive behavior (${loopCheck.type}). Consider trying a different approach.`;
        messages.push(new HumanMessage(loopWarning));
      }

      if (denied) {
        // 检查是否有可用的工具结果
        const deniedCount = toolMessages.filter(tm =>
          tm.content === 'Tool execution denied by user.'
        ).length;

        const hasAvailableResults = toolMessages.some(tm =>
          tm.content &&
          tm.content !== 'Tool execution denied by user.' &&
          tm.content !== 'Skipped (already executed).'
        );

        if (!hasAvailableResults) {
          // 所有工具都被拒绝，返回错误信息
          const totalTime = Date.now() - ctx.startTime;
          yield {
            type: 'done',
            answer: `请求无法完成。${deniedCount} 个工具被用户拒绝。`,
            toolCalls: ctx.scratchpad.getToolCallRecords(),
            iterations: ctx.iteration,
            totalTime,
            tokenUsage: ctx.tokenCounter.getUsage(),
            tokensPerSecond: ctx.tokenCounter.getTokensPerSecond(totalTime),
          };
          return;
        }

        // 有部分工具可用，通知 LLM 继续处理
        const deniedMessage = `[Note] ${deniedCount} tool(s) were denied by user. Please analyze the available results and provide an answer based on partial data, or suggest an alternative approach.`;
        messages.push(new HumanMessage(deniedMessage));
        // 不要终止，继续循环让 LLM 处理部分成功的工具结果
      }

      // Context threshold management (may compact the message array)
      const messageState = { messages };
      yield* this.manageContextThreshold(ctx, query, memoryFlushState, messageState);
      messages = messageState.messages;

      // Inject tool usage warning if approaching limits
      const toolUsageWarning = ctx.scratchpad.formatToolUsageForPrompt();
      if (toolUsageWarning) {
        messages.push(new HumanMessage(toolUsageWarning));
      }

      // Inject token usage context for LLM awareness (every 5 iterations)
      const tokenUsage = ctx.tokenCounter.getUsage();
      if (tokenUsage && ctx.iteration % 5 === 0 && tokenUsage.totalTokens > 0) {
        const usageContext = `[Token Usage] Total: ${tokenUsage.totalTokens.toLocaleString()} tokens used (input: ${tokenUsage.inputTokens?.toLocaleString() ?? 0}, output: ${tokenUsage.outputTokens?.toLocaleString() ?? 0}). Be concise.`;
        messages.push(new HumanMessage(usageContext));
      }

      // Drain queued messages: user may have sent follow-ups while agent was working
      const drainResult = this.drainQueue();
      if (drainResult) {
        messages.push(new HumanMessage(drainResult.text));
        yield { type: 'queue_drain', messageCount: drainResult.count, mergedText: drainResult.text } as QueueDrainEvent;
      }
    }

    // Max iterations reached
    const totalTime = Date.now() - ctx.startTime;
    yield {
      type: 'done',
      answer: `Reached maximum iterations (${this.maxIterations}). I was unable to complete the research in the allotted steps.`,
      toolCalls: ctx.scratchpad.getToolCallRecords(),
      iterations: ctx.iteration,
      totalTime,
      tokenUsage: ctx.tokenCounter.getUsage(),
      tokensPerSecond: ctx.tokenCounter.getTokensPerSecond(totalTime),
    };
    } finally {
      cleanup();
    }
  }

  // ---------------------------------------------------------------------------
  // LLM call methods
  // ---------------------------------------------------------------------------

  /**
   * Call LLM with streaming, falling back to blocking invoke on error.
   * Yields StreamProgressEvents as chunks arrive; returns the final accumulated message.
   */
  private async *callModelWithStreaming(
    messages: BaseMessage[],
  ): AsyncGenerator<StreamProgressEvent, { response: AIMessage; usage?: TokenUsage }> {
    try {
      return yield* this.streamAndAccumulate(messages);
    } catch (streamErr) {
      // Handle fallback-triggered errors (model-specific failures)
      if (streamErr instanceof FallbackTriggeredError) {
        warn('agent', `Fallback triggered for model ${streamErr.failedModel}: ${streamErr.message}`);
        try {
          const result = await this.fallbackHandler.executeWithFallback(
            async (model) => {
              const res = await callLlmWithMessages(messages, {
                model,
                tools: this.tools,
                signal: this.signal,
              });
              return {
                response: res.response as AIMessage,
                usage: res.usage,
                model,
              };
            },
          );
          return { response: result.response as AIMessage, usage: result.usage };
        } catch (fallbackError) {
          const fallbackMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          error('agent', `All fallback models exhausted: ${fallbackMsg}`);
          throw fallbackError;
        }
      }

      const errorMessage = streamErr instanceof Error ? streamErr.message : String(streamErr);
      warn('agent', `Streaming failed, falling back to blocking: ${errorMessage}`);
      // Fallback to blocking invoke (handles providers without streaming support)
      return await this.callModelWithMessages(messages);
    }
  }

  /**
   * Stream the LLM response, yielding per-chunk progress events and finally
   * returning the accumulated AIMessage. Stream-mode lifecycle:
   * 'requesting' before the first chunk, then 'thinking'/'responding'/'tool-input'
   * derived from chunk content shape, then 'tool-use' after stream end if there
   * are tool calls awaiting execution.
   *
   * Has a 60-second timeout for first token. If exceeded, falls back to blocking.
   */
  private async *streamAndAccumulate(
    messages: BaseMessage[],
  ): AsyncGenerator<StreamProgressEvent, { response: AIMessage; usage?: TokenUsage }> {
    yield { type: 'stream_progress', charDelta: 0, mode: 'requesting' };

    let accumulated: AIMessageChunk | null = null;
    const startTime = Date.now();
    let gotFirstChunk = false;

    for await (const chunk of streamLlmWithMessages(messages, {
      model: this.model,
      tools: this.tools,
      signal: this.signal,
    })) {
      // Timeout check: if no chunks for 60 seconds, abort and fallback
      if (!gotFirstChunk) {
        if (Date.now() - startTime > 60000) {
          warn('agent', 'Streaming timeout (60s), falling back to blocking');
          throw new Error('Stream timeout: no chunks received in 60s');
        }
      }
      gotFirstChunk = true;

      accumulated = accumulated ? accumulated.concat(chunk) : chunk;
      const { charDelta, mode, toolName, partialJson, toolCallId, textContent } = inspectChunkContent(chunk);

      // 累积文本内容用于 SDK query() 返回
      if (textContent) {
        this.accumulatedText += textContent;
      }

      if (charDelta > 0 || mode !== 'responding') {
        yield { type: 'stream_progress', charDelta, mode, toolName, partialJson, toolCallId, textContent };
      }
    }

    if (!accumulated) {
      throw new Error('Stream produced no chunks');
    }

    const response = new AIMessage({
      content: accumulated.content,
      tool_calls: accumulated.tool_calls,
      invalid_tool_calls: accumulated.invalid_tool_calls,
      usage_metadata: accumulated.usage_metadata,
      response_metadata: accumulated.response_metadata,
    });

    if (response.tool_calls && response.tool_calls.length > 0) {
      yield { type: 'stream_progress', charDelta: 0, mode: 'tool-use' };
    }

    const usage = accumulated.usage_metadata
      ? {
          inputTokens: accumulated.usage_metadata.input_tokens ?? 0,
          outputTokens: accumulated.usage_metadata.output_tokens ?? 0,
          totalTokens: accumulated.usage_metadata.total_tokens ?? 0,
        }
      : undefined;

    return { response, usage };
  }

  /**
   * Blocking LLM call (fallback when streaming fails).
   */
  private async callModelWithMessages(
    messages: BaseMessage[],
  ): Promise<{ response: AIMessage; usage?: TokenUsage }> {
    const result = await callLlmWithMessages(messages, {
      model: this.model,
      tools: this.tools,
      signal: this.signal,
    });
    return { response: result.response as AIMessage, usage: result.usage };
  }

  // ---------------------------------------------------------------------------
  // Tool execution
  // ---------------------------------------------------------------------------

  /**
   * Execute tools and collect ToolMessages mapped by tool_call_id.
   * Supports concurrent execution — events may arrive out of order.
   */
  private async *executeToolsAndCollectMessages(
    response: AIMessage,
    ctx: RunContext,
  ): AsyncGenerator<AgentEvent, { toolMessages: ToolMessage[]; denied: boolean }> {
    const toolMessageMap = new Map<string, ToolMessage>();
    const toolStartTimes = new Map<string, number>();
    let denied = false;
    const toolCalls = response.tool_calls!;

    // Get observation buffer for memory extraction (Claude Code PostToolUse pattern)
    const obsBuffer = getObservationBuffer();

    // Plan mode flow control: block non-plan tools during planning
    const planModeState = getPlanModeState();
    const blockedTools = new Set<string>();

    for (const tc of toolCalls) {
      const toolName = tc.name ?? 'unknown';
      if (!planModeState.isToolAllowed(toolName)) {
        blockedTools.add(toolName);
        // Mark as denied
        toolMessageMap.set(tc.id!, new ToolMessage({
          content: planModeState.getBlockedMessage(toolName),
          tool_call_id: tc.id!,
          name: toolName,
        }));
        denied = true;
      }
    }

    // Skip execution if all tools are blocked
    if (blockedTools.size > 0 && blockedTools.size === toolCalls.length) {
      warn('agent', `All tools blocked by plan mode: ${Array.from(blockedTools).join(', ')}`);
      const toolMessages: ToolMessage[] = toolCalls.map(tc =>
        toolMessageMap.get(tc.id!)!,
      );
      return { toolMessages, denied };
    }

    // Execute allowed tools
    const allowedToolCalls = toolCalls.filter(tc => !blockedTools.has(tc.name ?? 'unknown'));
    const filteredResponse = allowedToolCalls.length > 0 ? {
      ...response,
      tool_calls: allowedToolCalls,
    } : response;

    for await (const event of this.toolExecutor.executeAll(filteredResponse as AIMessage, ctx)) {
      yield event;

      if (event.type === 'tool_start' && event.toolCallId) {
        toolStartTimes.set(event.toolCallId, Date.now());
      } else if (event.type === 'tool_end' && event.toolCallId) {
        toolMessageMap.set(event.toolCallId, new ToolMessage({
          content: event.result,
          tool_call_id: event.toolCallId,
          name: event.tool,
        }));

        // Telemetry: record successful tool call
        recordToolCallOk({
          type: 'tool_end',
          tool: event.tool,
          args: event.args || {},
          result: event.result,
          duration: event.duration ?? 0,
          toolCallId: event.toolCallId,
        });

        // Record observation for memory extraction (Claude Code PostToolUse pattern)
        obsBuffer.recordObservation({
          timestamp: Date.now(),
          toolName: event.tool,
          args: event.args || {},
          result: event.result,
          success: true,
        });

        // Hook: PostToolUse — notify hook system of successful tool execution
        try {
          const { getHookExecutor } = await import('../hooks/tool-hooks.js');
          await getHookExecutor().postToolUse({
            toolName: event.tool,
            args: event.args || {},
            result: typeof event.result === 'string' ? event.result : JSON.stringify(event.result),
            toolCallId: event.toolCallId,
          });
        } catch { /* hooks must not crash agent loop */ }

      } else if (event.type === 'tool_error' && event.toolCallId) {
        toolMessageMap.set(event.toolCallId, new ToolMessage({
          content: `Error: ${event.error}`,
          tool_call_id: event.toolCallId,
          name: event.tool,
        }));

        // Telemetry: record failed tool call (duration computed from start time)
        const startedAt = toolStartTimes.get(event.toolCallId) ?? null;
        recordToolCallErr(
          {
            type: 'tool_error',
            tool: event.tool,
            error: event.error ?? 'unknown',
            toolCallId: event.toolCallId,
          },
          startedAt,
        );

        // Record error observation for memory extraction
        obsBuffer.recordObservation({
          timestamp: Date.now(),
          toolName: event.tool,
          args: {},
          result: `Error: ${event.error}`,
          success: false,
        });

        // Hook: PostToolUseFailure — notify hook system of tool error
        try {
          const { getHookExecutor } = await import('../hooks/tool-hooks.js');
          await getHookExecutor().postToolUseFailure({
            toolName: event.tool,
            args: {},
            error: event.error || 'Unknown error',
            toolCallId: event.toolCallId,
          });
        } catch { /* hooks must not crash agent loop */ }

      } else if (event.type === 'tool_denied' && event.toolCallId) {
        toolMessageMap.set(event.toolCallId, new ToolMessage({
          content: 'Tool execution denied by user.',
          tool_call_id: event.toolCallId,
          name: event.tool,
        }));
        denied = true;
      }
    }

    // Produce ToolMessages in ORIGINAL tool_calls order
    const toolMessages: ToolMessage[] = toolCalls.map(tc =>
      toolMessageMap.get(tc.id!) ?? new ToolMessage({
        content: 'Skipped (already executed).',
        tool_call_id: tc.id!,
        name: tc.name,
      }),
    );

    return { toolMessages, denied };
  }

  // ---------------------------------------------------------------------------
  // Message queue
  // ---------------------------------------------------------------------------

  /**
   * Drain all queued messages, merge into a single text block.
   * Returns null if the queue is empty or not configured.
   */
  private drainQueue(): { text: string; count: number } | null {
    if (!this.messageQueue || this.messageQueue.isEmpty()) {
      return null;
    }
    const messages = this.messageQueue.dequeueAll();
    if (messages.length === 0) return null;
    return {
      text: messages.map(m => m.text).join('\n\n'),
      count: messages.length,
    };
  }

  // ---------------------------------------------------------------------------
  // Response handling
  // ---------------------------------------------------------------------------

  private async *handleDirectResponse(
    responseText: string,
    ctx: RunContext,
    messages: BaseMessage[],
  ): AsyncGenerator<AgentEvent, void> {
    const totalTime = Date.now() - ctx.startTime;

    // Trigger stop hooks (memory extraction, session memory, etc.)
    // These run in background after the turn completes
    this.turnCount++;

    if (this.memoryEnabled && isFeatureEnabled('dexter_stop_hooks_enabled')) {
      const stopContext: StopHookContext = {
        messages,
        sessionId: this.sessionId,
        turnCount: this.turnCount,
        cwd: process.cwd(),
        timestamp: Date.now(),
      };

      // Execute all stop hooks (fire and forget)
      const hookRegistry = getStopHookRegistry();
      hookRegistry.executeAll(stopContext);
      debug('hooks', `Triggered stop hooks for turn ${this.turnCount}`);
    }

    const toolCallRecords = ctx.scratchpad.getToolCallRecords();
    const tokenUsage = ctx.tokenCounter.getUsage();

    // Add final AI response to messages array for session persistence
    if (responseText) {
      const finalResponse = new AIMessage({
        content: responseText,
        tool_calls: undefined,
      });
      messages.push(finalResponse);
    }

    // Log agent completion
    const answerPreview = responseText.length > 100 ? responseText.substring(0, 100) + '...' : responseText;
    perf('agent', `Agent completed: ${toolCallRecords.length} tools, ${ctx.iteration} iterations, ${totalTime}ms`, totalTime, {
      toolsUsed: toolCallRecords.map(tc => tc.tool),
      iterations: ctx.iteration,
      totalTokens: tokenUsage?.totalTokens,
      answerPreview,
    });

    yield {
      type: 'done',
      answer: responseText || this.accumulatedText,  // 优先使用 responseText，如果为空则使用累积的文本
      toolCalls: toolCallRecords,
      iterations: ctx.iteration,
      totalTime,
      tokenUsage,
      tokensPerSecond: ctx.tokenCounter.getTokensPerSecond(totalTime),
    };
  }

  // ---------------------------------------------------------------------------
  // Message array management
  // ---------------------------------------------------------------------------

  /**
   * Remove oldest AI+Tool message rounds, keeping SystemMessage, history,
   * HumanMessage, and the most recent N rounds.
   */
  /**
   * Strip text content from old AIMessages, keeping only the most recent N.
   * Preserves tool_calls structure (required for ToolMessage pairing).
   */
  private stripOldThinking(messages: BaseMessage[], keepLast: number): void {
    // Collect indices of AIMessages with text content
    const aiIndices: number[] = [];
    for (let i = 0; i < messages.length; i++) {
      if (messages[i] instanceof AIMessage) {
        aiIndices.push(i);
      }
    }

    // Only strip if we have more than keepLast AIMessages
    const toStrip = aiIndices.slice(0, -keepLast);
    for (const idx of toStrip) {
      const msg = messages[idx] as AIMessage;
      // Only strip if it has tool_calls (reasoning before tools — safe to clear)
      if (msg.tool_calls && msg.tool_calls.length > 0 && msg.content) {
        messages[idx] = new AIMessage({
          content: '',
          tool_calls: msg.tool_calls,
          invalid_tool_calls: msg.invalid_tool_calls,
          usage_metadata: msg.usage_metadata,
          response_metadata: msg.response_metadata,
        });
      }
    }
  }

  private truncateMessages(messages: BaseMessage[], keepRounds: number): number {
    let roundStartIndex = 0;
    for (let i = 0; i < messages.length; i++) {
      if (messages[i] instanceof AIMessage) {
        roundStartIndex = i;
        break;
      }
    }
    if (roundStartIndex === 0) return 0;

    const rounds: { start: number; end: number }[] = [];
    let i = roundStartIndex;
    while (i < messages.length) {
      if (messages[i] instanceof AIMessage) {
        const start = i;
        i++;
        while (i < messages.length && (messages[i] instanceof ToolMessage || messages[i] instanceof HumanMessage)) {
          i++;
        }
        rounds.push({ start, end: i });
      } else {
        i++;
      }
    }

    const roundsToRemove = Math.max(0, rounds.length - keepRounds);
    if (roundsToRemove === 0) return 0;

    const removeEnd = rounds[roundsToRemove - 1].end;
    const removed = removeEnd - roundStartIndex;
    messages.splice(roundStartIndex, removed);
    return removed;
  }

  /**
   * Replace message array with compacted version after LLM summarization.
   */
  private compactMessages(messages: BaseMessage[], summary: string, query: string): BaseMessage[] {
    return [
      messages[0], // SystemMessage
      new HumanMessage(`${query}\n\n${summary}`),
    ];
  }

  // ---------------------------------------------------------------------------
  // Context threshold management
  // ---------------------------------------------------------------------------

  private async *manageContextThreshold(
    ctx: RunContext,
    query: string,
    memoryFlushState: { alreadyFlushed: boolean },
    messageState: { messages: BaseMessage[] },
  ): AsyncGenerator<ContextClearedEvent | CompactionEvent | AgentEvent, void> {
    const estimatedContextTokens = ctx.lastApiInputTokens > 0
      ? ctx.lastApiInputTokens
      : estimateTokens(messageState.messages.map(m =>
          typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        ).join('\n'));
    const threshold = getAutoCompactThreshold(this.model);

    if (estimatedContextTokens <= threshold) {
      return;
    }

    // Step 1: Memory flush
    const fullToolResults = ctx.scratchpad.getToolResults();
    if (
      this.memoryEnabled &&
      shouldRunMemoryFlush({
        estimatedContextTokens,
        threshold,
        alreadyFlushed: memoryFlushState.alreadyFlushed,
      })
    ) {
      yield { type: 'memory_flush', phase: 'start' };
      const flushResult = await runMemoryFlush({
        model: this.model,
        systemPrompt: this.systemPrompt,
        query,
        toolResults: fullToolResults,
        signal: this.signal,
      }).catch(() => ({ flushed: false, written: false as const }));
      memoryFlushState.alreadyFlushed = flushResult.flushed;
      yield {
        type: 'memory_flush',
        phase: 'end',
        filesWritten: flushResult.written ? [`${new Date().toISOString().slice(0, 10)}.md`] : [],
      };
    }

    // Step 2: Compaction
    if (
      this.compactionFailures < MAX_CONSECUTIVE_COMPACTION_FAILURES &&
      ctx.scratchpad.getActiveToolResultCount() >= MIN_TOOL_RESULTS_FOR_COMPACTION
    ) {
      yield { type: 'compaction', phase: 'start', preCompactTokens: estimatedContextTokens };

      // Hook: PreCompact — notify hook system before compaction
      try {
        const { getHookExecutor } = await import('../hooks/tool-hooks.js');
        await getHookExecutor().preCompact({
          messages: messageState.messages,
          tokenCount: estimatedContextTokens,
        });
      } catch { /* hooks must not crash compaction */ }

      try {
        const result = await compactContext({
          model: this.model,
          systemPrompt: this.systemPrompt,
          query,
          toolResults: fullToolResults,
          signal: this.signal,
        });

        messageState.messages = this.compactMessages(messageState.messages, result.summary, query);
        ctx.scratchpad.setCompactionSummary(result.summary);

        if (result.usage) {
          ctx.tokenCounter.add(result.usage);
          // Sync compaction token usage to AppState
          try {
            const { getAppState, calculateTokenCost } = await import('../state/index.js');
            const appState = getAppState();
            appState.addTokens(result.usage.inputTokens, result.usage.outputTokens);
            const cost = calculateTokenCost(result.usage.inputTokens, result.usage.outputTokens, this.model);
            appState.addCost(cost);
          } catch { /* non-critical */ }
        }

        this.compactionFailures = 0;
        memoryFlushState.alreadyFlushed = false;

        // Hook: PostCompact — notify hook system after successful compaction
        try {
          const { getHookExecutor } = await import('../hooks/tool-hooks.js');
          await getHookExecutor().postCompact({
            messages: messageState.messages,
            tokenCount: estimatedContextTokens,
          });
        } catch { /* hooks must not crash compaction */ }

        const postCompactTokens = estimateTokens(
          messageState.messages.map(m =>
            typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
          ).join('\n'),
        );

        yield {
          type: 'compaction',
          phase: 'end',
          success: true,
          preCompactTokens: estimatedContextTokens,
          postCompactTokens,
          compactionModel: resolveProvider(this.model).fastModel ?? this.model,
        };

        return;
      } catch {
        this.compactionFailures++;
        yield {
          type: 'compaction',
          phase: 'end',
          success: false,
          preCompactTokens: estimatedContextTokens,
        };
      }
    }

    // Step 3: Fallback — truncate oldest rounds
    const removed = this.truncateMessages(messageState.messages, KEEP_TOOL_USES);
    if (removed > 0) {
      memoryFlushState.alreadyFlushed = false;
      yield { type: 'context_cleared', clearedCount: removed, keptCount: KEEP_TOOL_USES };
    }
  }
}

const MODE_PRIORITY: Record<StreamMode, number> = {
  requesting: 0,
  responding: 1,
  thinking: 2,
  'tool-input': 3,
  'tool-use': 4,
};

/**
 * Walk one streaming chunk's content and report total char-delta plus the most
 * "advanced" mode the chunk contains. LangChain content can be a plain string
 * (most providers) or an array of typed parts (Anthropic).
 */
function inspectChunkContent(chunk: AIMessageChunk): {
  charDelta: number;
  mode: StreamMode;
  toolName?: string;
  partialJson?: string;
  toolCallId?: string;
  textContent?: string;  // 新增: 实际文本内容用于累积
} {
  const content = chunk.content;
  if (typeof content === 'string') {
    return { charDelta: content.length, mode: 'responding', textContent: content };
  }
  if (!Array.isArray(content)) {
    return { charDelta: 0, mode: 'responding' };
  }

  let charDelta = 0;
  let mode: StreamMode = 'responding';
  let toolName: string | undefined;
  let partialJson: string | undefined;
  let toolCallId: string | undefined;
  let textContent: string | undefined;

  for (const part of content) {
    if (!part || typeof part !== 'object') continue;
    const partType = (part as { type?: string }).type;
    if (partType === 'text') {
      const text = (part as { text?: string }).text;
      if (typeof text === 'string') {
        charDelta += text.length;
        textContent = (textContent || '') + text;
      }
      if (MODE_PRIORITY.responding > MODE_PRIORITY[mode]) mode = 'responding';
    } else if (partType === 'thinking' || partType === 'redacted_thinking') {
      const thinkingText = (part as { thinking?: string }).thinking;
      if (typeof thinkingText === 'string') {
        charDelta += thinkingText.length;
        textContent = (textContent || '') + thinkingText;  // Include thinking in text content
      }
      if (MODE_PRIORITY.thinking > MODE_PRIORITY[mode]) mode = 'thinking';
    } else if (partType === 'tool_use' || partType === 'input_json_delta') {
      const pj = (part as { input?: unknown; partial_json?: string }).partial_json;
      const name = (part as { name?: string }).name;
      const id = (part as { id?: string }).id;
      if (typeof pj === 'string') {
        charDelta += pj.length;
        partialJson = pj;
      }
      if (name) toolName = name;
      if (id) toolCallId = id;
      if (MODE_PRIORITY['tool-input'] > MODE_PRIORITY[mode]) mode = 'tool-input';
    }
  }
  return { charDelta, mode, toolName, partialJson, toolCallId, textContent };
}
