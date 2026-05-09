import { Container, ProcessTerminal, Spacer, Text, TUI } from '@mariozechner/pi-tui';
import type {
  ApprovalDecision,
  ToolEndEvent,
  ToolErrorEvent,
  ToolStartEvent,
} from './agent/index.js';
import { getApiKeyNameForProvider, getProviderDisplayName } from './utils/env.js';
import { defaultQueue } from './utils/message-queue.js';
import { logger } from './utils/logger.js';
import {
  AgentRunnerController,
  InputHistoryController,
  ModelSelectionController,
} from './controllers/index.js';
import {
  ApiKeyInputComponent,
  ApprovalPromptComponent,
  ChatLogComponent,
  CustomEditor,
  DebugPanelComponent,
  HintBarComponent,
  IntroComponent,
  WorkingIndicatorComponent,
  createApiKeyConfirmSelector,
  createModelSelector,
  createProviderSelector,
} from './components/index.js';
import { editorTheme, theme } from './theme.js';
import { matchCommands, type SlashCommand } from './commands/index.js';
import { initSpinner } from './utils/spinner.js';

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
 * Render a single display event into the chat log (used by incremental history).
 */
function renderEvent(
  chatLog: ChatLogComponent,
  display: { event: any; id: string; completed?: boolean; endEvent?: any; progressMessage?: string },
  itemStatus: string,
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
    return;
  }

  if (event.type === 'tool_approval') {
    chatLog.startTool(display.id, event.tool, event.args).setApproval(event.approved);
    return;
  }

  if (event.type === 'tool_denied') {
    const path = (event.args.path as string) ?? '';
    chatLog.startTool(display.id, event.tool, event.args).setDenied(path, event.tool);
    return;
  }

  if (event.type === 'tool_limit') {
    const component = chatLog.startTool(display.id, event.tool, {});
    component.setLimitWarning(event.warning);
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
}

export async function runCli() {
  const tui = new TUI(new ProcessTerminal());
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
  const modelSelection = new ModelSelectionController(onError, () => {
    intro.setModel(modelSelection.model);
    agentRunner?.updateAgentConfig({
      model: modelSelection.model,
      modelProvider: modelSelection.provider,
    });
    renderSelectionOverlay();
    tui.requestRender();
  });

  // Incremental history tracking
  let lastRenderedEventCount = 0;
  let lastRenderedStatus = '';
  let lastRenderedAnswer = false;
  let lastRenderedQueryId: string | null = null;
  const finalizedToolIds = new Set<string>();

  agentRunner = new AgentRunnerController(
    { model: modelSelection.model, modelProvider: modelSelection.provider, maxIterations: 50 },
    modelSelection.inMemoryChatHistory,
    () => {
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
          renderEvent(chatLog, lastItem.events[i], lastItem.status);
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
  );

  const intro = new IntroComponent(modelSelection.model);
  const errorText = new Text('', 0, 0);
  const workingIndicator = new WorkingIndicatorComponent(tui);
  workingIndicator.setTurnStatsProvider(() => agentRunner.turnStats);
  const editor = new CustomEditor(tui, editorTheme);
  const hintBar = new HintBarComponent();
  const debugPanel = new DebugPanelComponent(8, true);
  const spacer = new Spacer(1);

  // Build the component tree ONCE — stable structure, no root.clear()
  root.addChild(intro);
  root.addChild(chatLog);
  root.addChild(errorText);
  root.addChild(workingIndicator);
  root.addChild(spacer);
  root.addChild(editor);
  root.addChild(hintBar);
  root.addChild(debugPanel);
  tui.addChild(root);
  initSpinner(tui);

  // Render throttle for agent events (~30fps max)
  let renderPending = false;
  const RENDER_THROTTLE_MS = 32;
  function throttledRender(): void {
    if (renderPending) return;
    renderPending = true;
    setTimeout(() => {
      renderPending = false;
      tui.requestRender();
    }, RENDER_THROTTLE_MS);
  }

  const refreshError = () => {
    const message = lastError ?? agentRunner.error;
    errorText.setText(message ? theme.error(`Error: ${message}`) : '');
  };

  // Slash command autocomplete state
  let slashSuggestions: SlashCommand[] = [];
  let slashSelectedIndex = 0;
  let slashActive = false;

  const HELP_TEXT = `Keyboard Shortcuts
  esc          Interrupt query / clear input
  ctrl+c       Exit Dexter
  /model       Switch LLM provider and model
  /rules       Show research rules
  /clear       Clear conversation
  ↑ / ↓        Navigate input history`;

  const handleSlashCommand = async (commandName: string, commandArgs: string = '') => {
    switch (commandName) {
      case 'model':
        modelSelection.startSelection();
        break;
      case 'rules':
        await agentRunner.runQuery('Show me my current research rules from .dexter/RULES.md');
        break;
      case 'clear':
        chatLog.clearAll();
        tui.requestRender();
        break;
      case 'memory':
        await agentRunner.runQuery('Show me what you know about me from memory. Use memory_search and memory_get.');
        break;
      case 'heartbeat':
        await agentRunner.runQuery('Show me my current heartbeat checklist from .dexter/HEARTBEAT.md');
        break;
      case 'history': {
        const messages = modelSelection.inMemoryChatHistory.getMessages();
        chatLog.addChild(new Spacer(1));
        if (messages.length === 0) {
          chatLog.addChild(new Text(theme.muted('No conversation history yet.'), 0, 0));
        } else {
          chatLog.addChild(new Text(theme.muted('Recent conversations:'), 0, 0));
          for (const msg of messages) {
            const summary = msg.summary ?? msg.answer?.slice(0, 100) ?? '(pending)';
            chatLog.addChild(new Text(theme.muted(`  ${msg.id + 1}. ${msg.query}`), 0, 0));
            chatLog.addChild(new Text(theme.muted(`     ${summary}`), 0, 0));
          }
        }
        tui.requestRender();
        break;
      }
      case 'help':
        chatLog.addChild(new Spacer(1));
        chatLog.addChild(new Text(theme.muted(HELP_TEXT), 0, 0));
        tui.requestRender();
        break;
      case 'plan':
        await agentRunner.runQuery('Use the enter_plan_mode tool to start planning. Think about what we need to accomplish and create a structured plan with steps.');
        break;
      case 'exit-plan':
        await agentRunner.runQuery('Use the exit_plan_mode tool with action="save" to exit plan mode and start execution.');
        break;
      case 'add-step':
        await agentRunner.runQuery('Use the add_plan_step tool to add a new step to the current plan.');
        break;
      case 'steps':
        await agentRunner.runQuery('Use the list_plan_steps tool to show all steps in the current plan.');
        break;
      case 'agent':
        await agentRunner.runQuery('Use the agent tool to spawn a child agent. For example: description="research task", prompt="Research the latest AI developments", subagent_type="general"');
        break;
      case 'tasks': {
        // Direct access to subagent runner - no LLM call needed
        try {
          const { getDefaultSubagentRunner } = await import('./agent/subagent-runner.js');
          const runner = getDefaultSubagentRunner();
          const tasks = runner.getAllTasks();

          chatLog.addChild(new Spacer(1));
          chatLog.addChild(new Text(theme.bold('Background Tasks'), 0, 0));
          chatLog.addChild(new Spacer(1));
          if (tasks.length === 0) {
            chatLog.addChild(new Text(theme.muted('No active background tasks.'), 0, 0));
          } else {
            for (const task of tasks) {
              chatLog.addChild(new Text(`${task.status}: ${task.prompt.substring(0, 50)}...`, 0, 0));
            }
          }
        } catch (e) {
          chatLog.addChild(new Text(theme.error('Task system not available'), 0, 0));
        }
        tui.requestRender();
        break;
      }
      case 'fork': {
        await agentRunner.runQuery('Use the agent tool to spawn a fork subagent. For example: description="parallel work", prompt="Do independent research on X", subagent_type="fork", run_in_background=true');
        break;
      }
      case 'status': {
        // Enhanced status with state management
        try {
          const { getAppState, formatCost, formatTokens, getSessionManager } = await import('./state/index.js');

          const appState = getAppState();
          const state = appState.getState();
          const session = getSessionManager();

          chatLog.addChild(new Spacer(1));
          chatLog.addChild(new Text(theme.bold('Dexter System Status'), 0, 0));
          chatLog.addChild(new Spacer(1));

          // Session info
          chatLog.addChild(new Text(theme.bold('Session:'), 0, 0));
          chatLog.addChild(new Text(`  ID: ${state.sessionId.substring(0, 20)}...`, 0, 0));
          chatLog.addChild(new Text(`  Duration: ${session.formatDuration(session.getSessionDuration())}`, 0, 0));

          // Model status
          chatLog.addChild(new Spacer(1));
          chatLog.addChild(new Text(theme.bold('Model:'), 0, 0));
          chatLog.addChild(new Text(`  ${state.model} (${state.provider})`, 0, 0));

          // Agent status
          chatLog.addChild(new Spacer(1));
          chatLog.addChild(new Text(theme.bold('Agent:'), 0, 0));
          chatLog.addChild(new Text(`  Status: ${agentRunner.isProcessing ? theme.primary('busy') : theme.success('idle')}`, 0, 0));
          chatLog.addChild(new Text(`  Messages: ${state.messageCount}`, 0, 0));
          chatLog.addChild(new Text(`  Compactions: ${state.compactionCount}`, 0, 0));

          // Tool count
          const { getTools } = await import('./tools/registry/index.js');
          const tools = await getTools(modelSelection.model);
          chatLog.addChild(new Spacer(1));
          chatLog.addChild(new Text(theme.bold('Tools:'), 0, 0));
          chatLog.addChild(new Text(`  Registered: ${tools.length}`, 0, 0));
          chatLog.addChild(new Text(`  Total calls: ${state.totalToolCalls}`, 0, 0));

          // Token usage
          chatLog.addChild(new Spacer(1));
          chatLog.addChild(new Text(theme.bold('Tokens:'), 0, 0));
          chatLog.addChild(new Text(`  Input:  ${formatTokens(state.totalInputTokens)}`, 0, 0));
          chatLog.addChild(new Text(`  Output: ${formatTokens(state.totalOutputTokens)}`, 0, 0));
          chatLog.addChild(new Text(`  Cost: ${formatCost(state.totalCostUSD)}`, 0, 0));

          // MCP status
          try {
            const { getDefaultMCPClient } = await import('./mcp/client.js');
            const { getMCPStatus } = await import('./mcp/registry.js');
            const mcpClient = getDefaultMCPClient();
            const mcpStatus = getMCPStatus(mcpClient);
            chatLog.addChild(new Spacer(1));
            chatLog.addChild(new Text(theme.bold('MCP:'), 0, 0));
            chatLog.addChild(new Text(`  Servers: ${mcpStatus.connectedServers}/${mcpStatus.totalServers}`, 0, 0));
            chatLog.addChild(new Text(`  MCP Tools: ${mcpStatus.totalTools}`, 0, 0));
          } catch {
            chatLog.addChild(new Text('MCP: not configured', 0, 0));
          }

          // Proactive status
          try {
            const { getProactiveController } = await import('./proactive/index.js');
            const proactive = getProactiveController();
            chatLog.addChild(new Spacer(1));
            chatLog.addChild(new Text(theme.bold('Proactive:'), 0, 0));
            chatLog.addChild(new Text(`  Mode: ${proactive.isActive() ? theme.success('active') : theme.muted('inactive')}`, 0, 0));
            chatLog.addChild(new Text(`  Events: ${state.proactiveEventsCount}`, 0, 0));
          } catch {
            chatLog.addChild(new Text('Proactive: unavailable', 0, 0));
          }
        } catch (e) {
          chatLog.addChild(new Spacer(1));
          chatLog.addChild(new Text(theme.error('Failed to load status') + ': ' + String(e), 0, 0));
        }

        tui.requestRender();
        break;
      }
      case 'cost': {
        // Enhanced cost tracking with state management
        try {
          const {
            getAppState,
            formatCost,
            formatTokens,
            getSessionManager,
          } = await import('./state/index.js');

          const appState = getAppState();
          const state = appState.getState();
          const session = getSessionManager();
          const duration = session.getSessionDuration();
          const hours = duration / (1000 * 60 * 60);
          const ratePerHour = hours > 0 ? state.totalCostUSD / hours : 0;

          chatLog.addChild(new Spacer(1));
          chatLog.addChild(new Text(theme.bold('Token Usage & Cost'), 0, 0));
          chatLog.addChild(new Spacer(1));

          // Token breakdown
          chatLog.addChild(new Text(`Session: ${session.formatDuration(duration)}`, 0, 0));
          chatLog.addChild(new Text(`Model: ${state.model}`, 0, 0));
          chatLog.addChild(new Spacer(1));

          chatLog.addChild(new Text(theme.bold('Token Usage:'), 0, 0));
          chatLog.addChild(new Text(`  Input:  ${formatTokens(state.totalInputTokens)} tokens`, 0, 0));
          chatLog.addChild(new Text(`  Output: ${formatTokens(state.totalOutputTokens)} tokens`, 0, 0));
          chatLog.addChild(new Text(`  Total:  ${formatTokens(state.totalTokens)} tokens`, 0, 0));
          chatLog.addChild(new Spacer(1));

          // Cost breakdown
          chatLog.addChild(new Text(theme.bold('Cost:'), 0, 0));
          chatLog.addChild(new Text(`  Session cost: ${formatCost(state.totalCostUSD)}`, 0, 0));
          chatLog.addChild(new Text(`  Rate: ~${formatCost(ratePerHour)}/hour`, 0, 0));
          chatLog.addChild(new Spacer(1));

          // Tool usage
          chatLog.addChild(new Text(theme.bold('Tool Usage:'), 0, 0));
          chatLog.addChild(new Text(`  Total calls: ${state.totalToolCalls}`, 0, 0));
          chatLog.addChild(new Text(`  Errors: ${state.totalToolErrors}`, 0, 0));

          // Efficiency
          if (state.totalToolCalls > 0) {
            const errorRate = (state.totalToolErrors / state.totalToolCalls * 100).toFixed(1);
            chatLog.addChild(new Text(`  Success rate: ${100 - parseFloat(errorRate)}%`, 0, 0));
          }

        } catch (e) {
          chatLog.addChild(new Spacer(1));
          chatLog.addChild(new Text(theme.error('Failed to load cost tracking') + ': ' + String(e), 0, 0));
        }
        tui.requestRender();
        break;
      }
      case 'compact': {
        chatLog.addChild(new Spacer(1));
        chatLog.addChild(new Text(theme.muted('Context compaction happens automatically when needed.'), 0, 0));
        chatLog.addChild(new Text(theme.muted('Manual compaction: /clear to start fresh.'), 0, 0));
        tui.requestRender();
        break;
      }
      case 'doctor': {
        // Health check - direct output
        chatLog.addChild(new Spacer(1));
        chatLog.addChild(new Text(theme.bold('Dexter Health Check'), 0, 0));
        chatLog.addChild(new Spacer(1));

        // Check API keys
        const { getApiKeyNameForProvider } = await import('./utils/env.js');
        const providers = ['openai', 'anthropic', 'google', 'xai', 'deepseek'];
        chatLog.addChild(new Text(theme.bold('API Keys:'), 0, 0));
        for (const provider of providers) {
          try {
            const keyName = getApiKeyNameForProvider(provider);
            if (!keyName) {
              chatLog.addChild(new Text(`  ${provider}: ${theme.muted('○ not in config')}`, 0, 0));
              continue;
            }
            const hasKey = Boolean(process.env[keyName]);
            chatLog.addChild(new Text(`  ${provider}: ${hasKey ? theme.success('✓ configured') : theme.error('✗ missing')}`, 0, 0));
          } catch {
            chatLog.addChild(new Text(`  ${provider}: ${theme.error('✗ error')}`, 0, 0));
          }
        }

        chatLog.addChild(new Spacer(1));
        chatLog.addChild(new Text(theme.bold('Modules:'), 0, 0));

        // Check memory
        try {
          const MemoryManager = (await import('./memory/index.js')).MemoryManager;
          const mm = await MemoryManager.get();
          chatLog.addChild(new Text(`  Memory: ${mm.isAvailable() ? theme.success('✓ available') : theme.error('✗ unavailable')}`, 0, 0));
        } catch (e) {
          chatLog.addChild(new Text(`  Memory: ${theme.error('✗ error')}`, 0, 0));
        }

        // Check MCP
        try {
          const { getDefaultMCPClient } = await import('./mcp/client.js');
          const { getMCPStatus } = await import('./mcp/registry.js');
          const mcpClient = getDefaultMCPClient();
          const status = getMCPStatus(mcpClient);
          chatLog.addChild(new Text(`  MCP: ${status.connectedServers > 0 ? theme.success('✓') : theme.muted('○')} ${status.connectedServers}/${status.totalServers} connected`, 0, 0));
        } catch {
          chatLog.addChild(new Text(`  MCP: ${theme.error('✗ unavailable')}`, 0, 0));
        }

        // Check permissions
        try {
          const { getPermissionEvaluator } = await import('./permissions/index.js');
          const evaluator = getPermissionEvaluator();
          chatLog.addChild(new Text(`  Permissions: ${theme.success('✓')} ${evaluator.getAllRules().length} rules`, 0, 0));
        } catch {
          chatLog.addChild(new Text(`  Permissions: ${theme.error('✗ unavailable')}`, 0, 0));
        }

        tui.requestRender();
        break;
      }
      case 'theme': {
        chatLog.addChild(new Spacer(1));
        chatLog.addChild(new Text(theme.bold('Theme Settings'), 0, 0));
        chatLog.addChild(new Spacer(1));
        chatLog.addChild(new Text('Current theme: Default', 0, 0));
        chatLog.addChild(new Text(theme.muted('Theme customization coming soon.'), 0, 0));
        tui.requestRender();
        break;
      }
      case 'mcp': {
        // Direct access to MCP status - no LLM call needed
        try {
          const { getDefaultMCPClient } = await import('./mcp/client.js');
          const { getMCPStatus } = await import('./mcp/registry.js');
          const mcpClient = getDefaultMCPClient();
          const status = getMCPStatus(mcpClient);

          chatLog.addChild(new Spacer(1));
          chatLog.addChild(new Text(theme.bold('MCP Server Status'), 0, 0));
          chatLog.addChild(new Spacer(1));
          chatLog.addChild(new Text(`Servers: ${status.connectedServers}/${status.totalServers}`, 0, 0));
          chatLog.addChild(new Text(`Total MCP tools: ${status.totalTools}`, 0, 0));
          if (status.servers.length > 0) {
            chatLog.addChild(new Spacer(1));
            for (const server of status.servers) {
              chatLog.addChild(new Text(`${server.name}: ${server.state} (${server.toolCount} tools)`, 0, 0));
            }
          } else {
            chatLog.addChild(new Spacer(1));
            chatLog.addChild(new Text(theme.muted('No MCP servers configured. Edit .dexter/mcp-config.json to add servers.'), 0, 0));
          }
        } catch (e) {
          chatLog.addChild(new Text(theme.error('MCP system not available'), 0, 0));
        }
        tui.requestRender();
        break;
      }
      case 'permissions': {
        // Direct access to permission system - no LLM call needed
        try {
          const { getPermissionEvaluator, getSessionPermissionManager } = await import('./permissions/index.js');
          const evaluator = getPermissionEvaluator();
          const sessionManager = getSessionPermissionManager();
          const rules = evaluator.getAllRules();
          const approved = sessionManager.getApprovedTools();

          chatLog.addChild(new Spacer(1));
          chatLog.addChild(new Text(theme.bold('Permission Settings'), 0, 0));
          chatLog.addChild(new Spacer(1));
          chatLog.addChild(new Text(`Active rules: ${rules.length}`, 0, 0));
          chatLog.addChild(new Text(`Session approved tools: ${approved.length > 0 ? approved.join(', ') : '(none)'}`, 0, 0));
          chatLog.addChild(new Spacer(1));
          chatLog.addChild(new Text(theme.muted('Use /approve <tool> or /deny <tool> to manage permissions.'), 0, 0));
        } catch (e) {
          chatLog.addChild(new Text(theme.error('Permission system not available'), 0, 0));
        }
        tui.requestRender();
        break;
      }
      case 'approve': {
        chatLog.addChild(new Spacer(1));
        chatLog.addChild(new Text(theme.muted('To approve a tool, either:'), 0, 0));
        chatLog.addChild(new Text(theme.muted('1. Use the tool and select "allow-session" when prompted'), 0, 0));
        chatLog.addChild(new Text(theme.muted('2. Edit .dexter/permissions.json to add permanent rules'), 0, 0));
        tui.requestRender();
        break;
      }
      case 'deny': {
        chatLog.addChild(new Spacer(1));
        chatLog.addChild(new Text(theme.muted('To deny a tool, use the tool and select "deny" when prompted.'), 0, 0));
        chatLog.addChild(new Text(theme.muted('Denied tools cannot be used in this session.'), 0, 0));
        tui.requestRender();
        break;
      }
      case 'reset-permissions': {
        try {
          const { resetPermissions } = await import('./permissions/index.js');
          resetPermissions();
          chatLog.addChild(new Spacer(1));
          chatLog.addChild(new Text(theme.success('All session permissions have been reset.'), 0, 0));
        } catch (e) {
          chatLog.addChild(new Text(theme.error('Failed to reset permissions'), 0, 0));
        }
        tui.requestRender();
        break;
      }
      case 'proactive': {
        try {
          const { getProactiveController } = await import('./proactive/index.js');
          const controller = getProactiveController();
          const state = controller.getState();

          if (state.active) {
            controller.deactivate();
            chatLog.addChild(new Spacer(1));
            chatLog.addChild(new Text(theme.muted('Proactive mode deactivated.'), 0, 0));
          } else {
            controller.activate();
            chatLog.addChild(new Spacer(1));
            chatLog.addChild(new Text(theme.success('Proactive mode activated!'), 0, 0));
            chatLog.addChild(new Text(theme.muted('Background events will be processed automatically.'), 0, 0));
          }
        } catch (e) {
          chatLog.addChild(new Text(theme.error('Proactive mode not available'), 0, 0));
        }
        tui.requestRender();
        break;
      }
      case 'events': {
        try {
          const { getProactiveController } = await import('./proactive/index.js');
          const controller = getProactiveController();
          const events = controller.getEventHistory(20);

          chatLog.addChild(new Spacer(1));
          chatLog.addChild(new Text(theme.bold('Recent Proactive Events'), 0, 0));
          chatLog.addChild(new Spacer(1));
          if (events.length === 0) {
            chatLog.addChild(new Text(theme.muted('No events recorded yet.'), 0, 0));
          } else {
            for (const event of events.reverse()) {
              const time = event.timestamp.toLocaleTimeString();
              chatLog.addChild(new Text(`${time} ${event.type}`, 0, 0));
            }
          }
        } catch (e) {
          chatLog.addChild(new Text(theme.error('Event history not available'), 0, 0));
        }
        tui.requestRender();
        break;
      }
      default: {
        // Fallback to CommandRegistry for commands not in the switch
        try {
          const { getGlobalRegistry } = await import('./commands/commands.js');
          const registry = getGlobalRegistry();
          const hasCommand = registry.has(commandName);
          if (hasCommand) {
            const result = await registry.execute(`/${commandName} ${commandArgs}`.trim(), {
              cwd: process.cwd(),
              env: process.env as Record<string, string>,
            });
            chatLog.addChild(new Spacer(1));
            if (result.type === 'output') {
              chatLog.addChild(new Text(result.text, 0, 0));
            } else if (result.type === 'error') {
              chatLog.addChild(new Text(theme.error(result.message), 0, 0));
            } else if (result.type === 'clear') {
              chatLog.clearAll();
            } else if (result.type === 'compact') {
              await agentRunner.runQuery('Please compact the conversation context now.');
            }
            tui.requestRender();
          } else {
            chatLog.addChild(new Spacer(1));
            chatLog.addChild(new Text(theme.error(`Unknown command: /${commandName}. Type /help for available commands.`), 0, 0));
            tui.requestRender();
          }
        } catch (e) {
          chatLog.addChild(new Text(theme.error(`Command error: ${e instanceof Error ? e.message : String(e)}`), 0, 0));
          tui.requestRender();
        }
        break;
      }
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
      // Split command name from arguments: "/model deepseek" → name="model", args="deepseek"
      const spaceIdx = rawCommand.indexOf(' ');
      const commandName = (spaceIdx === -1 ? rawCommand : rawCommand.slice(0, spaceIdx)).toLowerCase();
      const commandArgs = spaceIdx === -1 ? '' : rawCommand.slice(spaceIdx + 1).trim();
      slashActive = false;
      slashSuggestions = [];
      await handleSlashCommand(commandName, commandArgs);
      return;
    }

    if (modelSelection.isInSelectionFlow() || agentRunner.pendingApproval) {
      return;
    }

    // If agent is busy, enqueue the message for mid-run injection
    if (agentRunner.isProcessing) {
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
    if (agentRunner.isProcessing || agentRunner.pendingApproval) {
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
    if (slashActive && slashSuggestions.length > 0) {
      hintBar.setSuggestions(slashSuggestions, slashSelectedIndex);
    } else {
      hintBar.clearSuggestions();
      hintBar.update({
        isProcessing: agentRunner.isProcessing,
        hasPendingApproval: !!agentRunner.pendingApproval,
        hasInput: editor.getText().trim().length > 0,
        escPendingClear,
        escPendingExit,
        queueLength: defaultQueue.length(),
      });
    }
    if (!modelSelection.isInSelectionFlow() && !agentRunner.pendingApproval) {
      tui.setFocus(editor);
    }
  };

  /**
   * Show a full-screen selection view by replacing the root content.
   * Used for infrequent user-initiated overlays (model selection, approval).
   */
  const showScreenView = (
    title: string,
    description: string,
    body: any,
    footer?: string,
    focusTarget?: any,
  ) => {
    root.clear();
    root.addChild(createScreen(title, description, body, footer));
    if (focusTarget) {
      tui.setFocus(focusTarget);
    }
  };

  /**
   * Restore the main view after an overlay screen closes.
   */
  const restoreMainView = () => {
    root.clear();
    root.addChild(intro);
    root.addChild(chatLog);
    root.addChild(errorText);
    root.addChild(workingIndicator);
    root.addChild(spacer);
    root.addChild(editor);
    root.addChild(hintBar);
    root.addChild(debugPanel);
    updateView();
  };

  const renderSelectionOverlay = () => {
    const state = modelSelection.state;
    if (state.appState === 'idle' && !agentRunner.pendingApproval) {
      restoreMainView();
      tui.requestRender();
      return;
    }

    if (agentRunner.pendingApproval) {
      const prompt = new ApprovalPromptComponent(
        agentRunner.pendingApproval.tool,
        agentRunner.pendingApproval.args,
      );
      prompt.onSelect = (decision: ApprovalDecision) => {
        agentRunner.respondToApproval(decision);
      };
      showScreenView('', '', prompt, undefined, prompt.selector);
      return;
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
    if (modelSelection.isInSelectionFlow()) {
      modelSelection.cancelSelection();
      return;
    }
    if (agentRunner.isProcessing || agentRunner.pendingApproval) {
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

  editor.onSlashChange = (text: string) => {
    slashSuggestions = matchCommands(text);
    slashSelectedIndex = 0;
    slashActive = slashSuggestions.length > 0;
    updateView();
    tui.requestRender();
  };

  editor.onSlashNavigate = (direction: 'up' | 'down') => {
    if (direction === 'down') {
      slashSelectedIndex = Math.min(slashSelectedIndex + 1, slashSuggestions.length - 1);
    } else {
      slashSelectedIndex = Math.max(slashSelectedIndex - 1, 0);
    }
    updateView();
    tui.requestRender();
  };

  editor.onSlashSelect = () => {
    const selected = slashSuggestions[slashSelectedIndex];
    if (selected) {
      slashActive = false;
      slashSuggestions = [];
      editor.setText('');
      void handleSlashCommand(selected.name, '');
    }
    updateView();
    tui.requestRender();
  };

  editor.onSlashDismiss = () => {
    slashActive = false;
    slashSuggestions = [];
    updateView();
    tui.requestRender();
  };

  await inputHistory.init();
  for (const msg of inputHistory.getMessages().reverse()) {
    editor.addToHistoryWithTruncation(msg);
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
