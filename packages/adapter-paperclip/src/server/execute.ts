/**
 * Core execution logic for the UpUp Paperclip adapter.
 *
 * Spawns UpUp agent and returns structured results to Paperclip.
 */

import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
  UsageSummary,
} from '@paperclipai/adapter-utils';

import {
  buildPaperclipEnv,
  renderTemplate,
} from '@paperclipai/adapter-utils/server-utils';

import { Agent } from '@upup/agent-core';

import type { AgentEvent, DoneEvent, ToolStartEvent, ToolEndEvent, ThinkingEvent, ToolErrorEvent, StreamProgressEvent } from '@upup/agent-core';

import { calculateTokenCost } from '@upup/state';

import {
  ADAPTER_TYPE,
  DEFAULT_TIMEOUT_SEC,
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_MODEL,
  DEFAULT_PROMPT_TEMPLATE,
  DEFAULT_PAPERCLIP_API_URL,
  DEFAULT_CWD,
  inferProvider,
} from '../shared/constants.js';

import type { UpupAdapterConfig, UpupSessionParams, AcpxLogEntry } from '../shared/types.js';

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function cfgString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function cfgNumber(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

function cfgBoolean(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildPrompt(
  ctx: AdapterExecutionContext,
  config: Record<string, unknown>,
): string {
  const template = cfgString(config.promptTemplate) || DEFAULT_PROMPT_TEMPLATE;

  const taskId = cfgString(ctx.config?.taskId);
  const taskTitle = cfgString(ctx.config?.taskTitle) || '';
  const taskBody = cfgString(ctx.config?.taskBody) || '';

  // Build API URL
  let paperclipApiUrl =
    cfgString(config.paperclipApiUrl) ||
    process.env.PAPERCLIP_API_URL ||
    DEFAULT_PAPERCLIP_API_URL;
  if (!paperclipApiUrl.endsWith('/api')) {
    paperclipApiUrl = paperclipApiUrl.replace(/\/+$/, '') + '/api';
  }

  const vars: Record<string, unknown> = {
    agentId: ctx.agent?.id || '',
    agentName: ctx.agent?.name || 'UpUp Agent',
    companyId: ctx.agent?.companyId || '',
    taskId: taskId || '',
    taskTitle,
    taskBody,
    paperclipApiUrl,
  };

  // Handle conditional sections: {{#key}}...{{/key}}
  let rendered = template;

  // {{#taskId}}...{{/taskId}} — include if task is assigned
  rendered = rendered.replace(
    /\{\{#taskId\}\}([\s\S]*?)\{\{\/taskId\}\}/g,
    taskId ? '$1' : '',
  );

  // {{#noTask}}...{{/noTask}} — include if no task
  rendered = rendered.replace(
    /\{\{#noTask\}\}([\s\S]*?)\{\{\/noTask\}\}/g,
    taskId ? '' : '$1',
  );

  // Replace remaining {{variable}} placeholders
  return renderTemplate(rendered, vars);
}

// ---------------------------------------------------------------------------
// Event emission
// ---------------------------------------------------------------------------

async function emitAcpxLog(
  ctx: AdapterExecutionContext,
  entry: AcpxLogEntry,
): Promise<void> {
  const line = JSON.stringify(entry) + '\n';
  await ctx.onLog('stdout', line);
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

interface ErrorClassification {
  errorCode: string;
  errorFamily?: string;
  retryNotBefore?: string;
}

function classifyError(err: unknown): ErrorClassification {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('aborted')) {
    return { errorCode: 'upup_timeout', errorFamily: 'transient_upstream' };
  }
  if (lower.includes('api_key') || lower.includes('auth') || lower.includes('credential') ||
    lower.includes('invalid api key') || lower.includes('authentication')) {
    return { errorCode: 'upup_auth_error', errorFamily: 'auth' };
  }
  if (lower.includes('rate_limit') || lower.includes('429') || lower.includes('rate limit')) {
    return { errorCode: 'upup_rate_limit', errorFamily: 'transient_upstream' };
  }
  if (lower.includes('context') && (lower.includes('limit') || lower.includes('overflow') || lower.includes('too long'))) {
    return { errorCode: 'upup_context_limit', errorFamily: 'transient_upstream' };
  }
  return { errorCode: 'upup_runtime_error', errorFamily: 'runtime' };
}

// ---------------------------------------------------------------------------
// Main execute function
// ---------------------------------------------------------------------------

export async function execute(
  ctx: AdapterExecutionContext,
): Promise<AdapterExecutionResult> {
  const config = (ctx.config ?? ctx.agent?.adapterConfig ?? {}) as Record<string, unknown>;
  const startTime = Date.now();

  // ── Resolve configuration ──────────────────────────────────────────────
  const model = cfgString(config.model) || process.env.DEFAULT_MODEL || DEFAULT_MODEL;
  const provider = cfgString(config.provider) || inferProvider(model);
  const timeoutSec = cfgNumber(config.timeoutSec) ?? DEFAULT_TIMEOUT_SEC;
  const maxIterations = cfgNumber(config.maxIterations) ?? DEFAULT_MAX_ITERATIONS;
  const persistSession = cfgBoolean(config.persistSession) !== false;
  const cwd = cfgString(config.cwd) || cfgString(ctx.config?.workspaceDir) || DEFAULT_CWD;

  // ── Build prompt ───────────────────────────────────────────────────────
  const prompt = buildPrompt(ctx, config);

  // ── Log start ──────────────────────────────────────────────────────────
  await ctx.onLog(
    'stdout',
    `[upup] Starting UpUp Agent (model=${model}, provider=${provider}, timeout=${timeoutSec}s)\n`,
  );

  // ── Extract session params for resume ─────────────────────────────────
  const prevSessionParams = ctx.runtime.sessionParams as Record<string, unknown> | null;
  const prevSessionId = cfgString(prevSessionParams?.sessionId);
  if (prevSessionId) {
    await ctx.onLog('stdout', `[upup] Resuming session: ${prevSessionId}\n`);
  }

  // ── Setup AbortController for timeout ──────────────────────────────────
  const abortController = new AbortController();
  const timeoutTimer = setTimeout(() => {
    abortController.abort();
  }, timeoutSec * 1000);

  // ── Initialize agent ───────────────────────────────────────────────────
  let agent: Agent | null = null;
  try {
    agent = await Agent.create({
      model,
      maxIterations,
      signal: abortController.signal,
    });
  } catch (err) {
    clearTimeout(timeoutTimer);
    const errClass = classifyError(err);
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: err instanceof Error ? err.message : String(err),
      errorCode: errClass.errorCode,
      errorFamily: errClass.errorFamily as AdapterExecutionResult['errorFamily'],
      provider,
      model,
    };
  }

  // ── Execute agent ───────────────────────────────────────────────────────
  const textParts: string[] = [];
  let doneEvent: DoneEvent | null = null;
  let errorMessage: string | undefined;
  let timedOut = false;
  let streamBuffer = '';

  try {
    const stream = agent.run(prompt);

    for await (const event of stream) {
      // Handle different event types
      switch (event.type) {
        case 'thinking':
          await emitAcpxLog(ctx, {
            type: 'acpx.text_delta',
            text: event.message,
            channel: 'thought',
          });
          break;

        case 'stream_progress':
          // Accumulate streaming text
          streamBuffer += event.partialJson || '';
          if (event.charDelta > 0 && event.mode === 'responding') {
            // Don't emit every char, accumulate
          }
          break;

        case 'tool_start':
          await emitAcpxLog(ctx, {
            type: 'acpx.tool_call',
            name: event.tool,
            toolCallId: event.toolCallId,
            status: 'pending',
            text: JSON.stringify(event.args),
          });
          break;

        case 'tool_end':
          await emitAcpxLog(ctx, {
            type: 'acpx.tool_call',
            name: event.tool,
            toolCallId: event.toolCallId,
            status: 'completed',
            text: event.result.slice(0, 500), // Truncate to avoid huge output
          });
          break;

        case 'tool_error':
          await emitAcpxLog(ctx, {
            type: 'acpx.error',
            message: event.error,
            code: 'tool_error',
          });
          break;

        case 'done':
          doneEvent = event;
          await emitAcpxLog(ctx, {
            type: 'acpx.result',
            summary: event.answer.slice(0, 200),
            stopReason: `completed_after_${event.iterations}_iterations`,
          });
          break;
      }
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      timedOut = true;
      errorMessage = `Execution timed out after ${timeoutSec}s`;
    } else {
      errorMessage = err instanceof Error ? err.message : String(err);
    }
  } finally {
    clearTimeout(timeoutTimer);
  }

  // ── Build result ────────────────────────────────────────────────────────
  const usage = doneEvent?.tokenUsage;
  const costUsd = usage
    ? calculateTokenCost(usage.inputTokens, usage.outputTokens, model)
    : undefined;

  const result: AdapterExecutionResult = {
    exitCode: errorMessage || timedOut ? 1 : 0,
    signal: timedOut ? 'SIGTERM' : null,
    timedOut,
    errorMessage: errorMessage || null,
    provider,
    model,
    billingType: 'api',
    usage: usage
      ? {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        }
      : undefined,
    costUsd: costUsd ?? null,
    sessionParams: persistSession
      ? {
          sessionId: doneEvent
            ? `upup-session-${startTime}`
            : prevSessionId || `upup-session-${startTime}`,
          model,
          provider,
          cwd,
        }
      : null,
    resultJson: {
      status: errorMessage ? 'failed' : 'completed',
      stopReason: doneEvent
        ? `completed_after_${doneEvent.iterations}_iterations`
        : timedOut
          ? 'timeout'
          : 'error',
      iterations: doneEvent?.iterations ?? 0,
      totalTimeMs: Date.now() - startTime,
    },
    summary: doneEvent?.answer?.slice(0, 2000) || errorMessage || null,
  };

  // ── Log completion ──────────────────────────────────────────────────────
  await ctx.onLog(
    'stdout',
    `[upup] Exit code: ${result.exitCode}, timed out: ${timedOut}, tokens: ${usage?.inputTokens ?? 0}/${usage?.outputTokens ?? 0}\n`,
  );

  return result;
}
