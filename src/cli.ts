import { CombinedAutocompleteProvider, Container, ProcessTerminal, Spacer, Text, TuiMainScreen, Key, matchesKey, type TUI } from '@earendil-works/pi-tui';

// ============================================================================
// 全局渲染控制 - FIXED: 防止丢失渲染请求
// ============================================================================
let _renderPending = false;
let _needsRenderAfterPending = false;
let _tuiInstance: TUI | null = null;
const RENDER_THROTTLE_MS = 32;

/**
 * 节流渲染 - 用于普通事件 (30fps)
 */
function throttledRender(): void {
  if (!_tuiInstance) return;
  if (_renderPending) {
    _needsRenderAfterPending = true;
    return;
  }
  _renderPending = true;
  _needsRenderAfterPending = false;

  setImmediate(() => {
    _tuiInstance?.requestRender();
    _renderPending = false;

    if (_needsRenderAfterPending) {
      throttledRender();
    }
  });
}

/**
 * 强制渲染 - 用于关键事件 (工具开始/完成等)
 */
function forceRender(): void {
  _tuiInstance?.requestRender(true);
}
import type {
  ApprovalDecision,
  ToolEndEvent,
  ToolErrorEvent,
  ToolStartEvent,
} from '@upup/pi-event-adapter';
import { initialPermissionModeFromCLI } from './utils/permissions/permissionSetup.js'
import { setPermissionMode } from '@upup/pi-session'
import type { PermissionCliArgs } from './utils/permissions/types.js'

import { renderToolResult } from './tools/tool-renderers.js';
import { getApiKeyNameForProvider, getProviderDisplayName } from './utils/env.js';
import { defaultQueue } from './utils/message-queue.js';
import { logger } from './utils/logger.js';
import { validateConfig, isFirstTimeUse } from './utils/config-validation.js';
import {
  AgentRunnerController,
  InputHistoryController,
  ModelSelectionController,
  SessionSelectionController,
} from './controllers/index.js';
import type { RenderableMessage } from '@upup/pi-session';
import {
  ApiKeyInputComponent,
  ApprovalPromptComponent,
  ChatLogComponent,
  CustomEditor,
  DebugPanelComponent,
  getApprovalCursor,
  StatusHintComponent,
  IntroComponent,
  setApprovalCursor,
  WorkingIndicatorComponent,
  createApiKeyConfirmSelector,
  createModelSelector,
  createProviderSelector,
  createSessionSelector,
  createSessionDeleteConfirmSelector,
  SessionRenameInputComponent,
  SessionTagInputComponent,
  createFullscreenApproval,
  createApprovalSelector,
} from './components/index.js';
import { editorTheme, theme } from './theme.js';
import { type SlashCommand } from './commands/index.js';
import { listAllCommands } from './commands/unified-registry.js';
import { initSpinner } from './utils/spinner.js';
// Phase 50: 统一使用 input-state，移除 command-state
import { inputStore, inputSelectors, inputActions } from './tui/state/input-state.js';
import { isPiSkillCommand, toPiSkillPrompt } from './runtime/pi/skill-commands.js';
import { getPiSessionTools } from './runtime/pi/runner.js';


// Stores the user's approval decision when Enter/Esc is pressed before the
// inline approval UI has been rendered. Consumed by setApprovalPending.
let pendingApprovalDecisionGlobal: ApprovalDecision | null = null;

function truncateForHistory(text: string): string {
  const lines = text.split('\n');
  if (lines.length <= 3) return text;
  const firstLine = lines[0].trim() || lines[1]?.trim() || 'pasted content';
  const preview = firstLine.length > 60 ? firstLine.slice(0, 60) + '...' : firstLine;
  return `${preview} [+${lines.length - 1} lines]`;
}

function truncateAtWord(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  const lastSpace = str.lastIndexOf(' ', maxLength);
  if (lastSpace > maxLength * 0.5) {
    return `${str.slice(0, lastSpace)}...`;
  }
  return `${str.slice(0, maxLength)}...`;
}

function summarizeToolResult(tool: string, args: Record<string, unknown>, result: string): string {
  // Try tool-specific renderer first
  const customSummary = renderToolResult(tool, args, result);
  if (customSummary) return customSummary;

  if (tool === 'skill') {
    const skillName = args.skill as string;
    return `Loaded ${skillName} skill`;
  }
  try {
    const parsed = JSON.parse(result);
    if (parsed.data) {
      if (Array.isArray(parsed.data)) {
        return `Received ${parsed.data.length} items`;
      }
      if (typeof parsed.data === 'object') {
        const keys = Object.keys(parsed.data).filter((key) => !key.startsWith('_'));
        if (tool === 'get_financials' || tool === 'get_market_data' || tool === 'stock_screener') {
          return keys.length === 1 ? 'Called 1 data source' : `Called ${keys.length} data sources`;
        }
        if (tool === 'web_search') {
          return 'Did 1 search';
        }
        return `Received ${keys.length} fields`;
      }
    }
  } catch {
    return truncateAtWord(result, 50);
  }
  return 'Received data';
}

function createScreen(
  title: string,
  description: string,
  body: any,
  footer?: string,
): Container {
  const container = new Container();
  if (title) {
    container.addChild(new Text(theme.bold(theme.primary(title)), 0, 0));
  }
  if (description) {
    container.addChild(new Text(theme.muted(description), 0, 0));
  }
  container.addChild(new Spacer(1));
  container.addChild(body);
  if (footer) {
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.muted(footer), 0, 0));
  }
  return container;
}

/**
 * Render a history message (from session resume) into the chat log.
 * Used by Session 2.0 to display previous conversation.
 */
function renderHistoryMessage(
  msg: RenderableMessage,
  chatLog: ChatLogComponent,
  _theme: { primary: (text: string) => string; muted: (text: string) => string; dim: (text: string) => string },
): void {
  // 使用与原版相同的 ChatLogComponent 方法渲染历史消息
  // 保持与 renderEvent() 相同的渲染模式以确保 UI 一致

  switch (msg.type) {
    case 'user':
      // 用户消息使用 addQuery() + resetToolGrouping() - 与原版 UI 一致
      // 每个新 query 开始时重置工具分组
      chatLog.resetToolGrouping();
      chatLog.addQuery(msg.content);
      break;
    case 'assistant':
      // 助手消息使用 finalizeAnswer() - 与原版 UI 一致
      chatLog.finalizeAnswer(msg.content);
      break;
    case 'tool': {
      // 工具消息使用 startTool() + setComplete() - 与原版 UI 一致
      const toolId = msg.toolUseId || `history-tool-${msg.id}`;
      const toolName = msg.toolName || 'unknown';
      const args: Record<string, unknown> = {};
      const component = chatLog.startTool(toolId, toolName, args);
      // Summarize the result for the tool component
      const summary = summarizeToolResult(toolName, args, msg.content);
      component.setComplete(summary, 0); // Duration unknown for history
      break;
    }
    case 'system':
      // 系统消息直接添加文本
      chatLog.addChild(new Text(_theme.muted(`[System] ${msg.content}`), 0, 0));
      break;
  }
}

/**
 * Render a single display event into the chat log (used by incremental history).
 */
function renderEvent(
  chatLog: ChatLogComponent,
  display: { event: any; id: string; completed?: boolean; endEvent?: any; progressMessage?: string },
  itemStatus: string,
  agentRunner?: AgentRunnerController,
) {
  const event = display.event;

  if (event.type === 'thinking') {
    const message = event.message.trim();
    if (message) {
      chatLog.addChild(
        new Text(message.length > 200 ? `${message.slice(0, 200)}...` : message, 0, 0),
      );
    }
    return;
  }

  if (event.type === 'tool_start') {
    const toolStart = event as ToolStartEvent;
    const component = chatLog.startTool(display.id, toolStart.tool, toolStart.args);
    if (display.completed && display.endEvent?.type === 'tool_end') {
      const done = display.endEvent as ToolEndEvent;
      component.setComplete(
        summarizeToolResult(done.tool, toolStart.args, done.result),
        done.duration,
      );
    } else if (display.completed && display.endEvent?.type === 'tool_error') {
      const toolError = display.endEvent as ToolErrorEvent;
      component.setError(toolError.error);
    } else if (itemStatus === 'interrupted') {
      // Don't start spinner for tools in interrupted items
    } else if (display.progressMessage) {
      component.setActive(display.progressMessage);
    }
    forceRender();  // 工具开始时强制渲染
    return;
  }

  if (event.type === 'tool_approval') {
    const comp = chatLog.startTool(display.id, event.tool, event.args);
    const cb = (decision: ApprovalDecision) => {
      if (!agentRunner) return;
      agentRunner.respondToApproval(decision);
    };
    // Pass preStoredDecision so setApprovalPending can invoke cb immediately if
    // user pressed Enter/Esc before this UI was rendered.
    const stored = pendingApprovalDecisionGlobal;
    pendingApprovalDecisionGlobal = null;
    comp.setApprovalPending(cb, stored);
    forceRender();  // 工具审批时强制渲染
    return;
  }

  if (event.type === 'tool_denied') {
    const path = (event.args.path as string) ?? '';
    chatLog.startTool(display.id, event.tool, event.args).setDenied(path, event.tool);
    forceRender();  // 工具拒绝时强制渲染
    return;
  }

  if (event.type === 'tool_limit') {
    const component = chatLog.startTool(display.id, event.tool, {});
    component.setLimitWarning(event.warning);
    forceRender();  // 工具限制时强制渲染
    return;
  }

  if (event.type === 'context_cleared') {
    chatLog.addContextCleared(event.clearedCount, event.keptCount);
  }
  if (event.type === 'microcompact') {
    chatLog.addMicrocompact(event.cleared, event.tokensSaved);
  }
  if (event.type === 'queue_drain') {
    chatLog.addQueueDrain(event.messageCount);
  }
  if (event.type === 'compaction' && event.phase === 'end') {
    chatLog.addCompaction(event.success ?? false, event.preCompactTokens, event.postCompactTokens);
  }
  if (event.type === 'compaction' && event.phase === 'start') {
    chatLog.addChild(new Text(`${theme.muted('⏺ Compacting context...')}`, 0, 0));
  }
  if (event.type === 'memory_flush' && event.phase === 'end') {
    const files = event.filesWritten?.length ?? 0;
    chatLog.addChild(new Text(`${theme.muted('⎿')} ${theme.muted(`memory flushed (${files} file(s) written)`)}`, 0, 0));
  }
  if (event.type === 'memory_recalled') {
    const count = event.filesLoaded?.length ?? 0;
    const tokens = event.tokenCount ? ` (~${event.tokenCount} tokens)` : '';
    chatLog.addChild(new Text(`${theme.muted('⎿')} ${theme.muted(`memory recalled: ${count} file(s)${tokens}`)}`, 0, 0));
  }
  // 非关键事件使用节流渲染
  throttledRender();
}

export interface RunCliOptions {
  resumeTarget?: string;
  continue?: boolean;
  fork?: boolean;
  dangerouslySkipPermissions?: boolean;
  permissionMode?: string;
}

export async function runCli(options: RunCliOptions = {}) {
  // Initialize permission mode from CLI args
  const { mode, notification } = initialPermissionModeFromCLI({
    dangerouslySkipPermissions: options.dangerouslySkipPermissions,
    permissionMode: options.permissionMode,
  } as PermissionCliArgs)
  setPermissionMode(mode)

  if (notification) {
    console.log(`[Permissions] ${notification}`)
  }

  const tui = new TuiMainScreen(new ProcessTerminal());
  _tuiInstance = tui;  // 注册全局 TUI 实例用于渲染函数
  const root = new Container();
  const chatLog = new ChatLogComponent(tui);
  const inputHistory = new InputHistoryController(() => tui.requestRender());
  let lastError: string | null = null;

  const onError = (message: string) => {
    lastError = message;
    logger.error(message);
    tui.requestRender();
  };

  let agentRunner: AgentRunnerController;
  // Declare intro and renderSelectionOverlay early to avoid temporal dead zone
  let intro: IntroComponent;
  let needsRenderOverlay = false;
  const modelSelection = new ModelSelectionController(onError, () => {
    if (intro) intro.setModel(modelSelection.model);
    agentRunner?.updateAgentConfig({
      model: modelSelection.model,
      modelProvider: modelSelection.provider,
    });
    needsRenderOverlay = true;
    // Immediately render the selection overlay when model selection state changes
    renderSelectionOverlay();
    tui.requestRender();
  });

  const sessionSelection = new SessionSelectionController(() => {
    needsRenderOverlay = true;
    renderSelectionOverlay();
    tui.requestRender();
  });

  // JSX Command Overlay State - for rendering local-jsx command components
  let jsxOverlayActive = false;
  let jsxOverlayComponent: Container | null = null;
  let jsxOverlayOnClose: (() => void) | null = null;
  let jsxInputUnsubscriber: (() => void) | null = null;

  // P0-4, P0-5, P0-6: Startup validation (Plan12)
  // Validate configuration on startup and redirect to setup if needed
  const configValidation = validateConfig();

  if (!configValidation.valid) {
    // Show configuration errors
    chatLog.addChild(new Spacer(1));
    chatLog.addChild(new Text(theme.error('⚠ Configuration incomplete'), 0, 0));

    for (const error of configValidation.errors) {
      chatLog.addChild(new Text(theme.muted(`  • ${error}`), 0, 0));
    }

    chatLog.addChild(new Spacer(1));

    if (configValidation.isFirstTime) {
      // P0-6: First-time welcome UI
      chatLog.addChild(new Text(theme.bold(theme.primary('Welcome to UpUp!')), 0, 0));
      chatLog.addChild(new Text(theme.muted("Let's set up your AI provider..."), 0, 0));
      chatLog.addChild(new Spacer(1));
    }

    if (configValidation.missingProvider || configValidation.missingModel) {
      // P0-5: Redirect to model selection UI
      chatLog.addChild(new Text(
        theme.muted('Starting setup wizard...'),
        0, 0
      ));
      chatLog.addChild(new Spacer(1));
      tui.requestRender();

      // Auto-open model selection
      modelSelection.startSelection();
    }
  }

  // Incremental history tracking
  let lastRenderedEventCount = 0;
  let lastRenderedStatus = '';
  let lastRenderedAnswer = false;
  let lastRenderedQueryId: string | null = null;
  const finalizedToolIds = new Set<string>();

  // Prevent overlay scheduling loop
  let _isSchedulingOverlay = false;

  // Deferred overlay trigger — set after renderSelectionOverlay is defined
  let scheduleOverlay: () => void = () => {
    if (_isSchedulingOverlay) return;
    _isSchedulingOverlay = true;
    // no-op until wired — actual implementation below
  };

  agentRunner = new AgentRunnerController(
    { model: modelSelection.model, modelProvider: modelSelection.provider, maxIterations: 50 },
    modelSelection.inMemoryChatHistory,
    () => {
      // Route approval overlay first — must happen before any other rendering
      // Fix: Removed hasApprovalPending() check - callbacks from previous approvals
      // were not being cleared, causing second approvals to not show the dialog.
      if (agentRunner?.pendingApproval) {
        // Render pending approval events so callbacks get registered before the early return.
        // Without this, setApprovalPending() is never called and key handler finds no callback.
        const history = agentRunner.history;
        const lastItem = history[history.length - 1];
        if (lastItem) {
          for (let i = lastRenderedEventCount; i < lastItem.events.length; i++) {
            renderEvent(chatLog, lastItem.events[i], lastItem.status, agentRunner);
          }
          lastRenderedEventCount = lastItem.events.length;
        }
        // Always schedule overlay for pending approval - don't check hasApprovalPending()
        // as previous callbacks may still exist but should not block the dialog.
        scheduleOverlay();
        return;
      }
      // Incremental history update — only render new events
      const history = agentRunner.history;
      const lastItem = history[history.length - 1];
      if (lastItem) {
        // New query started — keyed by id so onChange storms don't re-render the header
        if (lastItem.id !== lastRenderedQueryId) {
          chatLog.addQuery(lastItem.query);
          chatLog.resetToolGrouping();
          lastRenderedQueryId = lastItem.id;
        }

        // Render new events only
        for (let i = lastRenderedEventCount; i < lastItem.events.length; i++) {
          renderEvent(chatLog, lastItem.events[i], lastItem.status, agentRunner);
        }
        lastRenderedEventCount = lastItem.events.length;

        // Update already-rendered tool events that may have completed
        for (const display of lastItem.events) {
          if (display.event.type === 'tool_start' && display.completed && display.endEvent && !finalizedToolIds.has(display.id)) {
            const component = chatLog.getToolById(display.id);
            if (component) {
              finalizedToolIds.add(display.id);
              if (display.endEvent.type === 'tool_end') {
                component.setComplete(
                  summarizeToolResult(display.endEvent.tool, display.event.args, display.endEvent.result),
                  display.endEvent.duration,
                );
              } else if (display.endEvent.type === 'tool_error') {
                component.setError(display.endEvent.error);
              }
            }
          }
          // Route sub-agent progress messages to nested detail lines
          if (display.event.type === 'tool_start' && !display.completed && display.progressMessage && !finalizedToolIds.has(display.id)) {
            const msg = display.progressMessage;
            if (msg.startsWith('→ ') || msg.startsWith('← ') || msg.startsWith('✗ ') || msg.startsWith('thinking:')) {
              chatLog.addSubAgentDetail(display.id, msg);
            }
          }
        }

        // Handle completion
        if (lastItem.answer && !lastRenderedAnswer) {
          chatLog.finalizeAnswer(lastItem.answer);
          lastRenderedAnswer = true;
        }
        if (lastItem.status === 'complete' && lastRenderedStatus !== 'complete') {
          chatLog.addPerformanceStats(lastItem.duration ?? 0, lastItem.tokenUsage, lastItem.tokensPerSecond);
        }
        if (lastItem.status === 'interrupted' && lastRenderedStatus !== 'interrupted') {
          // Stop all active tool spinners on interrupt
          for (const display of lastItem.events) {
            if (display.event.type === 'tool_start' && !finalizedToolIds.has(display.id)) {
              const component = chatLog.getToolById(display.id);
              component?.dispose?.();
              finalizedToolIds.add(display.id);
            }
          }
          chatLog.addInterrupted();
        }
        lastRenderedStatus = lastItem.status;
      }

      workingIndicator.setState(agentRunner.workingState);
      updateView();
      throttledRender();
    },
    undefined,
    (msg: import('@upup/pi-session').RenderableMessage) => {
      // Session 2.0: Render history messages when resuming
      renderHistoryMessage(msg, chatLog, theme);
    },
  );

  intro = new IntroComponent(modelSelection.model);
  const errorText = new Text('', 0, 0);
  const workingIndicator = new WorkingIndicatorComponent(tui);
  workingIndicator.setTurnStatsProvider(() => agentRunner.turnStats);
  const editor = new CustomEditor(tui, editorTheme);
  // SCAP-005: wire pi-tui's CombinedAutocompleteProvider directly. Slash, @
  // file, and `/<cmd> <arg>` completion is handled by the upstream provider
  // (its own fuzzyFilter + autocomplete popup). The Editor is the single
  // source of truth for the autocomplete UI; we never mirror its state.
  editor.setAutocompleteProvider(
    new CombinedAutocompleteProvider(listAllCommands(), process.cwd()),
  );
  editor.setAutocompleteMaxVisible(8);
  const statusHint = new StatusHintComponent();
  const debugPanel = new DebugPanelComponent(8, true);
  const spacer = new Spacer(1);

  // Build the component tree ONCE — stable structure, no root.clear()
  root.addChild(intro);
  root.addChild(chatLog);
  root.addChild(errorText);
  root.addChild(workingIndicator);
  root.addChild(spacer);
  root.addChild(editor);
  root.addChild(statusHint);
  root.addChild(debugPanel);
  tui.addChild(root);
  initSpinner(tui);

  const refreshError = () => {
    const message = lastError ?? agentRunner.error;
    errorText.setText(message ? theme.error(`Error: ${message}`) : '');
  };

  // Phase 50: 移除残留状态变量，完全依赖 inputStore
  // 状态管理统一使用 inputActions/inputSelectors

  const HELP_TEXT = `Keyboard Shortcuts
  esc          Interrupt query / clear input
  ctrl+c       Exit UpUp
  /model       Switch LLM provider and model
  /rules       Show research rules
  /clear       Clear conversation
  ↑ / ↓        Navigate input history`;

  // Import command system for delegation
  const executeCommandFromModule = async (name: string, args: string, context: { cwd: string; env: Record<string, string>; sessionId: string; model: string; state?: Record<string, unknown>; sessionDuration?: number; tools?: readonly { name: string; description: string }[] }) => {
    try {
      const commandsModule = await import('@upup/commands')
      const executeCommand = commandsModule.executeCommand

      if (!executeCommand) {
        return { type: 'error', message: 'executeCommand not found in @upup/commands' }
      }

      const result = await executeCommand(name, args, context);
      return result;
    } catch (e) {
      return { type: 'error', message: `Failed to import @upup/commands: ${e}` }
    }
  }

  const handleSlashCommand = async (commandName: string, commandArgs: string = '') => {
    // Track redirect chain for cycle detection (reset at top-level command)
    const redirectChain = new Set<string>()

    // Pi owns Skill expansion and execution. The legacy SkillExecutor is not
    // part of the CLI production path anymore.
    try {
      const piSkillName = commandName.replace(/^skill:/i, '');
      if (await isPiSkillCommand(piSkillName, process.cwd())) {
        chatLog.addChild(new Spacer(1));
        chatLog.addChild(new Text(theme.primary(`Executing /${commandName} through Pi...`), 0, 0));
        tui.requestRender();
        await agentRunner.runQuery(toPiSkillPrompt(piSkillName, commandArgs));
        return;
      }
    } catch (e) {
      // Error checking skill commands - continue with regular commands
    }

    // Special commands that require UI interaction (model selection, fork)
    // These cannot be handled by the module system
    if (commandName === 'model') {
      modelSelection.startSelection();
      return
    }

    if (commandName === 'fork') {
      await agentRunner.runQuery('Use the agent tool to spawn a fork subagent. For example: description="parallel work", prompt="Do independent research on X", subagent_type="fork", run_in_background=true');
      return
    }

    // Session requires special handling with sessionSelection controller
    if (commandName === 'session') {
      const cwd = process.cwd();
      const sessionId = agentRunner.sessionId;
      await sessionSelection.startSelection(cwd, sessionId);
      renderSelectionOverlay();
      tui.requestRender();
      return
    }

    if (commandName === 'resume') {
      const args = commandArgs.trim();
      const fork = args.includes('--fork');
      const searchTerm = args.replace('--fork', '').trim();

      if (searchTerm) {
        const { resolveResumeTarget } = await import('@upup/pi-session');
        const targetId = await resolveResumeTarget(searchTerm, process.cwd());
        if (targetId) {
          chatLog.addChild(new Spacer(1));
          chatLog.addChild(new Text(theme.primary(fork ? `Forking session...` : `Resuming session: ${targetId.slice(0, 8)}...`), 0, 0));
          tui.requestRender();
          try {
            const resumedId = await agentRunner?.resumeFromSession(targetId, fork);
            if (fork) {
              chatLog.addChild(new Text(theme.success(`Forked as: ${resumedId.slice(0, 8)}...`), 0, 0));
            }
          } catch (e) {
            chatLog.addChild(new Text(theme.error(`Failed to resume: ${String(e)}`), 0, 0));
          }
        } else {
          chatLog.addChild(new Spacer(1));
          chatLog.addChild(new Text(theme.error(`Session not found: "${searchTerm}"`), 0, 0));
          chatLog.addChild(new Text(theme.muted('Use /session to see available sessions'), 0, 0));
        }
      } else {
        const cwd = process.cwd();
        await sessionSelection.startSelection(cwd, agentRunner.sessionId);
        renderSelectionOverlay();
        tui.requestRender();
      }
      tui.requestRender();
      return
    }

    if (commandName === 'continue') {
      const { getMostRecentSession } = await import('@upup/pi-session');
      const lastSessionId = await getMostRecentSession(process.cwd());
      if (lastSessionId && lastSessionId !== agentRunner.sessionId) {
        chatLog.addChild(new Spacer(1));
        chatLog.addChild(new Text(theme.primary(`Continuing session: ${lastSessionId.slice(0, 8)}...`), 0, 0));
        tui.requestRender();
        await agentRunner?.resumeFromSession(lastSessionId);
      } else if (!lastSessionId) {
        chatLog.addChild(new Spacer(1));
        chatLog.addChild(new Text(theme.muted('No previous session found. Use /session to see available sessions.'), 0, 0));
        tui.requestRender();
      }
      return
    }

    // /skills — list installed skills with usage stats (P1.7 — round 2)
    if (commandName === 'skills') {
      try {
        const skills = await (await import('./runtime/pi/skill-commands.js')).listPiSkillCommands(process.cwd());
        const text = skills.length === 0
          ? 'No Pi skills found.'
          : ['Pi skills:', ...skills.slice(0, 50).map((skill) => `  /skill:${skill.name} — ${skill.description}`)].join('\n');
        chatLog.addChild(new Spacer(1));
        for (const line of text.split('\n')) {
          chatLog.addChild(new Text(line, 0, 0));
        }
        tui.requestRender();
      } catch (e) {
        chatLog.addChild(new Spacer(1));
        chatLog.addChild(new Text(theme.error(`Failed to list skills: ${String(e)}`), 0, 0));
        tui.requestRender();
      }
      return
    }

    // All other commands use the unified command system from @upup/commands
    try {
      // Get state for command execution
      let state: Record<string, unknown> | undefined
      try {
        // Loading state
        const { getAppState, getSessionManager } = await import('./state/index.js')

        const appState = getAppState()

        const appState2 = appState.getState()

        const session = getSessionManager()

        state = {
          ...appState2,
          sessionDuration: session.getSessionDuration(),
        }


      } catch (e) {
        // State not available, use empty state
        state = {
          sessionDuration: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalToolCalls: 0,
          totalToolErrors: 0,
          messageCount: 0,
        }
      }

      const result = await executeCommandFromModule(commandName, commandArgs, {
        cwd: process.cwd(),
        env: process.env as Record<string, string>,
        sessionId: agentRunner.sessionId,
        model: modelSelection.model,
        state,
        tools: getPiSessionTools(agentRunner.sessionId),
      })

      if (result.type === 'output' && result.text) {
        chatLog.addChild(new Spacer(1))
        chatLog.addChild(new Text(result.text, 0, 0))
      } else if (result.type === 'error') {
        chatLog.addChild(new Spacer(1))
        chatLog.addChild(new Text(theme.error(result.message || 'Unknown error'), 0, 0))
      } else if (result.type === 'clear') {
        chatLog.clearAll()
      } else if (result.type === 'compact') {
        await agentRunner.runQuery('Please compact the conversation context now.')
      } else if (result.type === 'jsx') {
        // For local-jsx commands, render the TUI component as an overlay
        if (result.component) {
          // Create a wrapper container for the JSX component
          const component = result.component as Container
          jsxOverlayComponent = component
          jsxOverlayActive = true

          // Create close handler
          jsxOverlayOnClose = () => {
            console.log('[CLI] jsxOverlayOnClose called')
            jsxOverlayActive = false
            jsxOverlayComponent = null
            jsxOverlayOnClose = null
            // Cleanup input listener
            if (jsxInputUnsubscriber) {
              jsxInputUnsubscriber()
              jsxInputUnsubscriber = null
            }
            // Hide the overlay
            tui.hideOverlay()
            tui.requestRender()
          }

          // Show the JSX component in an overlay
          const overlayHandle = tui.showOverlay(component, {
            anchor: 'center',
            width: '90%',
            maxHeight: '80%',
          })

          // Add input listener at TUI level to handle ESC
          const unsub = tui.addInputListener((data: string) => {
            if (data === '\x1b' && jsxOverlayActive) {
              jsxOverlayOnClose?.()
            }
            return undefined
          })
          jsxInputUnsubscriber = unsub

          // Store the handle for potential cleanup
          ;(component as any)._overlayHandle = overlayHandle
          tui.setFocus(component)
          tui.requestRender()
        } else {
          chatLog.addChild(new Spacer(1))
          chatLog.addChild(new Text(theme.error(`Command /${commandName} failed to render UI`), 0, 0))
        }
      } else if (result.type === 'noop') {
        // No operation - command completed but produced no visible output
      } else if (result.type === 'query') {
        // Inject text as a query to the agent
        const queryText = (result as { text?: string }).text || ''
        await agentRunner.runQuery(queryText)
      } else if (result.type === 'redirect') {
        // Redirect to another command with cycle detection
        const redirectCmd = (result as { command?: string }).command || ''

        // Check for redirect loop (cycle detection)
        if (redirectChain.has(redirectCmd)) {
          console.error(`[CMD] Redirect loop detected: ${[...redirectChain].join(' → ')} → ${redirectCmd}`)
          chatLog.addChild(new Spacer(1))
          chatLog.addChild(new Text(theme.error(`Redirect loop detected for /${redirectCmd}`), 0, 0))
        } else {
          redirectChain.add(redirectCmd)
          await handleSlashCommand(redirectCmd)
        }
      }
      tui.requestRender()
    } catch (e) {
      chatLog.addChild(new Spacer(1));
      chatLog.addChild(new Text(theme.error(`Unknown command: /${commandName}. Type /help for available commands.`), 0, 0));
      tui.requestRender();
    }
  };

  // Slash callbacks are wired after renderSelectionOverlay is defined (below)

  const handleSubmit = async (query: string) => {
    if (query.toLowerCase() === 'exit' || query.toLowerCase() === 'quit') {
      tui.stop();
      process.exit(0);
      return;
    }

    // Handle all slash commands
    if (query.startsWith('/')) {
      const rawCommand = query.slice(1).trim();
      // Ignore empty command (just "/" typed)
      if (!rawCommand) {
        // Phase 50: 只使用 inputActions
        inputActions.clear();
        editor.setText('');
        updateView();
        return;
      }
      // Split command name from arguments: "/model deepseek" → name="model", args="deepseek"
      const spaceIdx = rawCommand.indexOf(' ');
      const commandName = (spaceIdx === -1 ? rawCommand : rawCommand.slice(0, spaceIdx)).toLowerCase();
      const commandArgs = spaceIdx === -1 ? '' : rawCommand.slice(spaceIdx + 1).trim();
      // Phase 50: 只使用 inputActions
      inputActions.clear();
      editor.setText('');  // Clear editor after slash command
      updateView();
      await handleSlashCommand(commandName, commandArgs);
      return;
    }

    if (modelSelection.isInSelectionFlow() || agentRunner.pendingApproval) {
      return;
    }

    // If agent is busy, enqueue the message for mid-run injection
    if (agentRunner?.isProcessing) {
      defaultQueue.enqueue({
        text: query,
        priority: 'next',
        enqueuedAt: Date.now(),
        source: 'cli',
      });
      await inputHistory.saveMessage(query);
      chatLog.addQueuedMessage(query);
      tui.requestRender();
      return;
    }

    await inputHistory.saveMessage(query);
    inputHistory.resetNavigation();
    lastRenderedEventCount = 0;
    lastRenderedStatus = '';
    lastRenderedAnswer = false;
    finalizedToolIds.clear();
    const result = await agentRunner.runQuery(query);
    if (result?.answer) {
      await inputHistory.updateAgentResponse(result.answer);
    }
    
    refreshError();
    tui.requestRender();
  };

  editor.onSubmit = (text) => {
    const displayValue = text.trim();
    if (!displayValue) return;
    const fullValue = editor.getFullText(displayValue);
    editor.setText('');
    editor.addToHistoryWithTruncation(fullValue);
    void handleSubmit(fullValue);
  };

  let escPendingClear = false;
  let escPendingExit = false;
  let escTimeout: ReturnType<typeof setTimeout> | null = null;

  // onEscape is wired after renderSelectionOverlay is defined (below)

  editor.onCtrlC = () => {
    if (modelSelection.isInSelectionFlow()) {
      modelSelection.cancelSelection();
      return;
    }
    if (agentRunner?.isProcessing || agentRunner.pendingApproval) {
      agentRunner.cancelExecution();
      return;
    }
    tui.stop();
    process.exit(0);
  };

  /**
   * Update component state without rebuilding the tree.
   * The root is built once at init — this only changes text/hints/visibility.
   */
  const updateView = () => {
    refreshError();
    // Slash / file popup is rendered by pi-tui's Editor itself. We only
    // refresh the single-line status hint here.
    statusHint.update({
      isProcessing: agentRunner?.isProcessing,
      hasPendingApproval: !!agentRunner?.pendingApproval,
      hasInput: editor.getText().trim().length > 0,
      escPendingClear,
      escPendingExit,
      queueLength: defaultQueue.length(),
    });
    if (!modelSelection.isInSelectionFlow() && !agentRunner?.pendingApproval) {
      tui.setFocus(editor);
    }
  };

  /**
   * Show a full-screen selection view by replacing the root content.
   * Used for infrequent user-initiated overlays (model selection, approval).
   */
  function showScreenView(
    title: string,
    description: string,
    body: any,
    footer?: string,
    focusTarget?: any,
  ) {
    root.clear();
    root.addChild(createScreen(title, description, body, footer));
    if (focusTarget) {
      tui.setFocus(focusTarget);
    }
    tui.requestRender();
  };

  /**
   * Restore the main view after an overlay screen closes.
   */
  function restoreMainView() {
    root.clear();
    root.addChild(intro);
    root.addChild(chatLog);
    root.addChild(errorText);
    root.addChild(workingIndicator);
    root.addChild(spacer);
    root.addChild(editor);
    root.addChild(statusHint);
    root.addChild(debugPanel);
    updateView();
  };

  function renderSelectionOverlay() {
    const state = modelSelection.state;

    // Session selection takes priority over model selection
    if (sessionSelection.isActive()) {
      const sState = sessionSelection.state;
      if (sState.appState === 'session_list') {
        const selector = createSessionSelector(
          sState.sessions,
          async (sessionId) => {
            // Resume the selected session
            sessionSelection.cancel();
            chatLog.addChild(new Spacer(1));
            chatLog.addChild(new Text(theme.primary(`Resuming session...`), 0, 0));
            tui.requestRender();
            await agentRunner?.resumeFromSession(sessionId);
          },
          () => sessionSelection.cancel(),
        );
        showScreenView(
          'Sessions',
          `${sState.sessions.length} session${sState.sessions.length !== 1 ? 's' : ''} available`,
          selector,
          '↑↓ Navigate · Enter Resume · d Delete · n Rename · t Tag · Esc Cancel',
          selector,
        );
        return;
      }

      if (sState.appState === 'session_delete_confirm') {
        const session = sState.sessions.find(s => s.id === sState.pendingSessionId);
        const title = session?.customTitle || session?.firstPrompt?.slice(0, 40) || 'this session';
        const selector = createSessionDeleteConfirmSelector(
          title,
          async () => {
            await sessionSelection.confirmDelete();
          },
          () => sessionSelection.cancelDelete(),
        );
        showScreenView(
          'Confirm Delete',
          `Delete session "${title}"?`,
          selector,
          'Enter to confirm · Esc to cancel',
          selector,
        );
        return;
      }

      if (sState.appState === 'session_rename_input') {
        const input = new SessionRenameInputComponent();
        input.onSubmit = async (newTitle) => {
          await sessionSelection.submitRename(newTitle || '');
        };
        input.onCancel = () => sessionSelection.cancelRename();
        showScreenView(
          'Rename Session',
          'Enter a new title for this session',
          input,
          'Enter to save · Esc to cancel',
          input,
        );
        return;
      }

      if (sState.appState === 'session_tag_input') {
        const input = new SessionTagInputComponent();
        input.onSubmit = async (tag) => {
          await sessionSelection.submitTag(tag || '');
        };
        input.onCancel = () => sessionSelection.cancelTag();
        showScreenView(
          'Tag Session',
          'Enter a tag for this session (e.g. "bugfix", "refactor")',
          input,
          'Enter to save · Esc to cancel · Empty to remove tag',
          input,
        );
        return;
      }
    }

    if (state.appState === 'idle' && !agentRunner?.pendingApproval) {
      // Only restore main view if session selection is also idle
      if (!sessionSelection.isActive()) {
        restoreMainView();
        tui.requestRender();
        return;
      }
    }

    // Restore main view when both session and model selection are idle
    if (!sessionSelection.isActive() && !agentRunner?.pendingApproval && state.appState === 'idle') {
      restoreMainView();
      tui.requestRender();
      return;
    }

    // Use SelectList-based approval UI via showScreenView (same as model selection)
    // Fix: Removed !chatLog.hasApprovalPending() check - the callback state in tool
    // components was not being cleared properly, causing the second approval dialog
    // to not show. We now rely solely on agentRunner.pendingApproval state.
    if (agentRunner?.pendingApproval) {
      const pending = agentRunner.pendingApproval;
      if (pending) {
        const selector = createApprovalSelector((decision) => {
          agentRunner.respondToApproval(decision);
          restoreMainView();
        });
        showScreenView(
          'Authorization Required',
          `Tool: ${pending.tool}`,
          selector,
          '↑↓ Navigate · 1/2/3 Select · Enter Confirm · Esc Deny',
          selector,
        );
        tui.requestRender();
        return;
      }
    }

    if (state.appState === 'provider_select') {
      const selector = createProviderSelector(modelSelection.provider, (providerId) => {
        void modelSelection.handleProviderSelect(providerId);
      });
      showScreenView(
        'Select provider',
        'Switch between LLM providers. Applies to this session and future sessions.',
        selector,
        'Enter to confirm · esc to exit',
        selector,
      );
      return;
    }

    if (state.appState === 'model_select' && state.pendingProvider) {
      const selector = createModelSelector(
        state.pendingModels,
        modelSelection.provider === state.pendingProvider ? modelSelection.model : undefined,
        (modelId) => modelSelection.handleModelSelect(modelId),
        state.pendingProvider,
      );
      showScreenView(
        `Select model for ${getProviderDisplayName(state.pendingProvider)}`,
        '',
        selector,
        'Enter to confirm · esc to go back',
        selector,
      );
      return;
    }

    if (state.appState === 'model_input' && state.pendingProvider) {
      const input = new ApiKeyInputComponent();
      input.onSubmit = (value) => modelSelection.handleModelInputSubmit(value);
      input.onCancel = () => modelSelection.handleModelInputSubmit(null);
      showScreenView(
        `Enter model name for ${getProviderDisplayName(state.pendingProvider)}`,
        'Type or paste the model name from openrouter.ai/models',
        input,
        'Examples: anthropic/claude-3.5-sonnet, openai/gpt-4-turbo, meta-llama/llama-3-70b\nEnter to confirm · esc to go back',
        input,
      );
      return;
    }

    if (state.appState === 'api_key_confirm' && state.pendingProvider) {
      const selector = createApiKeyConfirmSelector((wantsToSet) =>
        modelSelection.handleApiKeyConfirm(wantsToSet),
      );
      showScreenView(
        'Set API Key',
        `Would you like to set your ${getProviderDisplayName(state.pendingProvider)} API key?`,
        selector,
        'Enter to confirm · esc to decline',
        selector,
      );
      return;
    }

    if (state.appState === 'api_key_input' && state.pendingProvider) {
      const input = new ApiKeyInputComponent(true);
      input.onSubmit = (apiKey) => modelSelection.handleApiKeySubmit(apiKey);
      input.onCancel = () => modelSelection.handleApiKeySubmit(null);
      const apiKeyName = getApiKeyNameForProvider(state.pendingProvider) ?? '';
      showScreenView(
        `Enter ${getProviderDisplayName(state.pendingProvider)} API Key`,
        apiKeyName ? `(${apiKeyName})` : '',
        input,
        'Enter to confirm · Esc to cancel',
        input,
      );
    }
  };

  // Wire callbacks that need renderSelectionOverlay (defined above)
  editor.onEscape = () => {
    // Priority 1: Close JSX overlay if active
    if (jsxOverlayActive && jsxOverlayOnClose) {
      // If the overlay component has a handleInput that handles Escape,
      // we should call it. Otherwise, close the overlay.
      const component = jsxOverlayComponent
      if (component && typeof (component as any).handleInput === 'function') {
        const handled = (component as any).handleInput('\x1b')
        if (handled) return // Component handled the Escape
      }
      jsxOverlayOnClose()
      return
    }

    // Priority 2: Cancel model selection flow
    if (modelSelection.isInSelectionFlow()) {
      modelSelection.cancelSelection();
      return;
    }

    // Priority 3: Cancel session selection
    if (sessionSelection.isActive()) {
      sessionSelection.cancel();
      return;
    }

    // Priority 4: Cancel agent execution
    if (agentRunner?.isProcessing || agentRunner?.pendingApproval) {
      agentRunner.cancelExecution();
      return;
    }

    const hasText = editor.getText().trim().length > 0;
    if (hasText) {
      // Double-Esc to clear input
      if (escPendingClear) {
        editor.setText('');
        escPendingClear = false;
        escPendingExit = false;
        if (escTimeout) { clearTimeout(escTimeout); escTimeout = null; }
      } else {
        escPendingClear = true;
        escPendingExit = false;
        if (escTimeout) clearTimeout(escTimeout);
        escTimeout = setTimeout(() => {
          escPendingClear = false;
          updateView();
          tui.requestRender();
        }, 2000);
      }
    } else {
      // Double-Esc to exit
      if (escPendingExit) {
        tui.stop();
        process.exit(0);
      } else {
        escPendingExit = true;
        escPendingClear = false;
        if (escTimeout) clearTimeout(escTimeout);
        escTimeout = setTimeout(() => {
          escPendingExit = false;
          updateView();
          tui.requestRender();
        }, 2000);
      }
    }
    updateView();
    tui.requestRender();
  };


  // Inline approval: interactive selection with arrow keys
  editor.onApprovalNavigate = (direction: 'up' | 'down') => {
    const cursor = getApprovalCursor();
    if (direction === 'down') {
      setApprovalCursor((cursor + 1) % 3); // 0→1→2→0
    } else {
      setApprovalCursor((cursor + 2) % 3); // 0→2→1→0
    }
    // Update the approval UI cursor display
    chatLog.updateApprovalCursor();
    tui.requestRender();
  };

  editor.onApprovalSelect = () => {
    const sel = getApprovalCursor(); // 0=allow-once, 1=allow-session, 2=deny
    setApprovalCursor(0);
    const decision: ApprovalDecision = sel === 0 ? 'allow-once' : sel === 1 ? 'allow-session' : 'deny';
    const cb = chatLog.getFirstApprovalCallback();
    if (cb) { cb(decision); return; }
    pendingApprovalDecisionGlobal = decision;
    if (agentRunner?.pendingApproval) {
      agentRunner.respondToApproval(decision);
    }
  };

  editor.onApprovalKey = (data: string) => {
    const key = data;

    // Only intercept keys when there is actually a pending approval
    // Check both pendingApproval and workingState.status for consistency
    const hasPendingApproval = !!agentRunner?.pendingApproval;
    const isInApprovalState = agentRunner.workingState.status === 'approval';

    if (!hasPendingApproval && !isInApprovalState) {
      return false;
    }

    // F2: Toggle fullscreen approval overlay
    if (key === '\x1bOP' || key === 'OP') {
      const pending = agentRunner.pendingApproval;
      if (pending) {
        const fullscreenApproval = createFullscreenApproval(
          { toolName: pending.tool, args: pending.args },
          {
            onApprove: (decision) => {
              agentRunner.respondToApproval(decision);
              restoreMainView();
            },
            onDeny: () => {
              agentRunner.respondToApproval('deny');
              restoreMainView();
            },
          }
        );
        showScreenView(
          'Authorization Required',
          `Tool: ${pending.tool}`,
          fullscreenApproval,
          '↑↓ Navigate · 1/2/3 Select · Enter Confirm · Esc Deny',
          fullscreenApproval,
        );
        return true;
      }
    }

    // Number keys 1/2/3 for quick selection
    if (key === '1') {
      setApprovalCursor(0);
      editor.onApprovalSelect?.();
      return true;
    }
    if (key === '2') {
      setApprovalCursor(1);
      editor.onApprovalSelect?.();
      return true;
    }
    if (key === '3') {
      setApprovalCursor(2);
      editor.onApprovalSelect?.();
      return true;
    }

    // Arrow key navigation
    if (matchesKey(key, Key.up)) {
      editor.onApprovalNavigate?.('up');
      return true;
    }
    if (matchesKey(key, Key.down)) {
      editor.onApprovalNavigate?.('down');
      return true;
    }

    // Tab: cycle forward one option
    if (matchesKey(key, Key.tab)) {
      editor.onApprovalNavigate?.('down');
      return true;
    }

    // Enter: confirm current selection
    if (key === '\r' || key === '\n') {
      editor.onApprovalSelect?.();
      return true;
    }

    // Esc: deny
    if (key === '\x1b') {
      setApprovalCursor(0);
      const cb = chatLog.getFirstApprovalCallback();
      if (cb) { cb('deny'); return true; }
      pendingApprovalDecisionGlobal = 'deny';
      if (agentRunner?.pendingApproval) {
        agentRunner.respondToApproval('deny');
        return true;
      }
      return false;
    }

    return false;
  };

  // Session list keyboard shortcuts: d=delete, n=rename, t=tag
  editor.onSessionListKey = (data: string) => {
    const key = data;

    if (!sessionSelection.isActive()) return false;

    const sState = sessionSelection.state;
    if (sState.appState !== 'session_list') return false;

    switch (key) {
      case 'd':
      case 'D':
        sessionSelection.startDelete();
        return true;
      case 'n':
      case 'N':
        sessionSelection.startRename();
        return true;
      case 't':
      case 'T':
        sessionSelection.startTag();
        return true;
      case 'r':
      case 'R':
        if (sessionSelection.selectedSession) {
          const sessionId = sessionSelection.selectedSession.id;
          sessionSelection.cancel();
          void (async () => {
            chatLog.addChild(new Spacer(1));
            chatLog.addChild(new Text(theme.primary(`Resuming session...`), 0, 0));
            tui.requestRender();
            await agentRunner?.resumeFromSession(sessionId);
          })();
        }
        return true;
      case 'f':
      case 'F':
        if (sessionSelection.selectedSession) {
          const sessionId = sessionSelection.selectedSession.id;
          sessionSelection.cancel();
          void (async () => {
            chatLog.addChild(new Spacer(1));
            chatLog.addChild(new Text(theme.primary(`Forking session...`), 0, 0));
            tui.requestRender();
            try {
              const newId = await agentRunner?.resumeFromSession(sessionId, true);
              chatLog.addChild(new Text(theme.success(`Forked as: ${newId.slice(0, 8)}...`), 0, 0));
            } catch (e) {
              chatLog.addChild(new Text(theme.error(`Failed to fork: ${String(e)}`), 0, 0));
            }
            tui.requestRender();
          })();
        }
        return true;
      default:
        return false;
    }
  };

  await inputHistory.init();
  for (const msg of inputHistory.getMessages().reverse()) {
    editor.addToHistoryWithTruncation(msg);
  }

  // Wire deferred overlay after renderSelectionOverlay is defined
  scheduleOverlay = () => {
    const pending = agentRunner.pendingApproval;
    if (pending) {
      // Clear any existing inline approval callbacks to prevent stale callbacks
      // from blocking the full-screen approval UI
      chatLog.clearAllApprovalCallbacks();

      const selector = createApprovalSelector((decision) => {
        agentRunner.respondToApproval(decision);
        restoreMainView();
      });
      showScreenView(
        'Authorization Required',
        `Tool: ${pending.tool}`,
        selector,
        '↑↓ Navigate · 1/2/3 Select · Enter Confirm · Esc Deny',
        selector,
      );
      tui.requestRender();
      _isSchedulingOverlay = false;
      return;
    }
    renderSelectionOverlay();
    tui.requestRender();
    _isSchedulingOverlay = false;
  };

  // Handle deferred overlay requests from early callbacks
  if (needsRenderOverlay) {
    renderSelectionOverlay();
  }

  // Handle CLI flags: --resume, -c, --continue
  if (options.resumeTarget !== undefined || options.continue) {
    const cwd = process.cwd();
    if (options.resumeTarget) {
      // Try to resolve the resume target
      const { resolveResumeTarget } = await import('@upup/pi-session');
      const targetId = await resolveResumeTarget(options.resumeTarget, cwd);
      if (targetId) {
        chatLog.addChild(new Spacer(1));
        chatLog.addChild(new Text(theme.primary(options.fork ? 'Forking session...' : 'Resuming session...'), 0, 0));
        chatLog.addChild(new Text(theme.muted(`Session: ${targetId.slice(0, 8)}...`), 0, 0));
        tui.requestRender();
        try {
          const resumedId = await agentRunner?.resumeFromSession(targetId, options.fork);
          if (options.fork) {
            chatLog.addChild(new Text(theme.success(`Forked as: ${resumedId.slice(0, 8)}...`), 0, 0));
          }
        } catch (e) {
          chatLog.addChild(new Text(theme.error(`Failed to resume: ${String(e)}`), 0, 0));
          tui.requestRender();
        }
      } else {
        chatLog.addChild(new Spacer(1));
        chatLog.addChild(new Text(theme.error(`Session not found: "${options.resumeTarget}"`), 0, 0));
        chatLog.addChild(new Text(theme.muted('Use /session to see available sessions'), 0, 0));
        tui.requestRender();
      }
    } else if (options.continue) {
      // Continue the most recent session
      const { getMostRecentSession } = await import('@upup/pi-session');
      const lastId = await getMostRecentSession(cwd);
      if (lastId) {
        chatLog.addChild(new Spacer(1));
        chatLog.addChild(new Text(theme.primary(options.fork ? 'Forking session...' : 'Continuing session...'), 0, 0));
        tui.requestRender();
        try {
          const resumedId = await agentRunner?.resumeFromSession(lastId, options.fork);
          if (options.fork) {
            chatLog.addChild(new Text(theme.success(`Forked as: ${resumedId.slice(0, 8)}...`), 0, 0));
          }
        } catch (e) {
          chatLog.addChild(new Text(theme.error(`Failed to continue: ${String(e)}`), 0, 0));
          tui.requestRender();
        }
      } else {
        chatLog.addChild(new Spacer(1));
        chatLog.addChild(new Text(theme.muted('No previous session found. Use /session to see available sessions.'), 0, 0));
        tui.requestRender();
      }
    } else {
      // -r without target: show session picker
      chatLog.addChild(new Spacer(1));
      chatLog.addChild(new Text(theme.primary('Opening session picker...'), 0, 0));
      chatLog.addChild(new Text(theme.muted('Use ↑↓ to navigate, Enter to select, Esc to cancel'), 0, 0));
      tui.requestRender();
      // Start session selection
      await sessionSelection.startSelection(cwd, agentRunner.sessionId);
    }
  }

  renderSelectionOverlay();
  refreshError();

  tui.start();

  await new Promise<void>((resolve) => {
    const finish = () => resolve();
    process.once('exit', finish);
    process.once('SIGINT', finish);
    process.once('SIGTERM', finish);
  });

  workingIndicator.dispose();
  debugPanel.dispose();
}
