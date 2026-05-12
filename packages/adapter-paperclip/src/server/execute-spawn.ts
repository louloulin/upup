/**
 * Core execution logic for the UpUp Paperclip adapter.
 *
 * Uses StdioPaperclipBridge to communicate with the UpUp agent via stdio.
 * This approach allows adapter-paperclip to be packaged and published
 * independently without depending on the main application's Agent class.
 */

import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
} from '@paperclipai/adapter-utils';

import { buildPaperclipEnv, renderTemplate } from '@paperclipai/adapter-utils/server-utils';

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

import type { AcpxLogEntry } from '../shared/types.js';

// Import stdio bridge - this is the key change
// The bridge uses @upup/sdk which is published independently
import { StdioPaperclipBridge } from '../bridge/stdio-bridge.js';

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

  let rendered = template;

  rendered = rendered.replace(
    /\{\{#taskId\}\}([\s\S]*?)\{\{\/taskId\}\}/g,
    taskId ? '$1' : '',
  );

  rendered = rendered.replace(
    /\{\{#noTask\}\}([\s\S]*?)\{\{\/noTask\}\}/g,
    taskId ? '' : '$1',
  );

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
// Subprocess result type
// ---------------------------------------------------------------------------

interface SubprocessResult {
  exitCode: number;
  signal: string | null;
  timedOut: boolean;
  errorMessage?: string;
  output: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  summary?: string;
}

// ---------------------------------------------------------------------------
// Run agent via stdio bridge
// ---------------------------------------------------------------------------

async function runAgentViaBridge(
  prompt: string,
  model: string,
  maxIterations: number,
  timeoutMs: number,
  ctx: AdapterExecutionContext,
): Promise<SubprocessResult> {
  const startTime = Date.now();
  let usage: { inputTokens: number; outputTokens: number } | undefined;
  let summary: string | undefined;
  let errorMessage: string | undefined;
  let timedOut = false;

  // Create the bridge - will spawn upup subprocess
  // Note: SDK handles binary finding automatically
  const bridge = new StdioPaperclipBridge({
    model,
    maxIterations,
  });

  const timeoutTimer = setTimeout(() => {
    timedOut = true;
    bridge.shutdown().catch(() => {});
  }, timeoutMs);

  try {
    // Connect to the subprocess
    await bridge.connect();

    // Run with streaming
    for await (const event of bridge.stream(prompt)) {
      // Convert bridge event to AcpxLogEntry and emit
      await emitAcpxLog(ctx, event);

      // Track usage and summary from done event
      if (event.type === 'acpx.result' && event.summary) {
        summary = event.summary;
      }

      // Extract usage from done event (if we had token info)
      // Note: The bridge doesn't currently return full token usage
      // This would need to be added to the bridge protocol
    }

    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      output: '',
      usage,
      summary,
    };
  } catch (err) {
    if (timedOut) {
      return {
        exitCode: 1,
        signal: 'SIGTERM',
        timedOut: true,
        errorMessage: `Execution timed out after ${timeoutMs}ms`,
        output: '',
      };
    }
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: err instanceof Error ? err.message : String(err),
      output: '',
    };
  } finally {
    clearTimeout(timeoutTimer);
    await bridge.shutdown();
  }
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

function classifyError(err: unknown): { errorCode: string; errorFamily?: string } {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('aborted')) {
    return { errorCode: 'upup_timeout', errorFamily: 'transient_upstream' };
  }
  if (lower.includes('api_key') || lower.includes('auth') || lower.includes('credential')) {
    return { errorCode: 'upup_auth_error', errorFamily: 'auth' };
  }
  if (lower.includes('rate_limit') || lower.includes('429')) {
    return { errorCode: 'upup_rate_limit', errorFamily: 'transient_upstream' };
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

  // Resolve configuration
  const model = cfgString(config.model) || process.env.DEFAULT_MODEL || DEFAULT_MODEL;
  const provider = cfgString(config.provider) || inferProvider(model);
  const timeoutSec = cfgNumber(config.timeoutSec) ?? DEFAULT_TIMEOUT_SEC;
  const maxIterations = cfgNumber(config.maxIterations) ?? DEFAULT_MAX_ITERATIONS;
  const persistSession = cfgBoolean(config.persistSession) !== false;
  const cwd = cfgString(config.cwd) || cfgString(ctx.config?.workspaceDir) || DEFAULT_CWD;
  const timeoutMs = timeoutSec * 1000;

  // Build prompt
  const prompt = buildPrompt(ctx, config);

  // Build Paperclip environment variables (passed to subprocess)
  const paperclipEnv = buildPaperclipEnv({
    id: ctx.agent?.id || '',
    companyId: ctx.agent?.companyId || '',
  });

  // Log start
  await ctx.onLog(
    'stdout',
    `[upup] Starting UpUp Agent via stdio (model=${model}, provider=${provider}, timeout=${timeoutSec}s)\n`,
  );

  // Extract session params for resume
  const prevSessionParams = ctx.runtime.sessionParams as Record<string, unknown> | null;
  const prevSessionId = cfgString(prevSessionParams?.sessionId);
  if (prevSessionId) {
    await ctx.onLog('stdout', `[upup] Resuming session: ${prevSessionId}\n`);
  }

  // Run agent via stdio bridge
  const result = await runAgentViaBridge(prompt, model, maxIterations, timeoutMs, ctx);

  // Calculate cost if we have usage data
  let costUsd: number | undefined;
  if (result.usage) {
    try {
      const { calculateTokenCost } = await import('@upup/state');
      costUsd = calculateTokenCost(result.usage.inputTokens, result.usage.outputTokens, model);
    } catch {
      // calculateTokenCost not available
    }
  }

  // Build session params
  const sessionId = result.exitCode === 0 && result.summary
    ? `upup-session-${startTime}`
    : prevSessionId || `upup-session-${startTime}`;

  const executionResult: AdapterExecutionResult = {
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    errorMessage: result.errorMessage || null,
    provider,
    model,
    billingType: 'api',
    usage: result.usage
      ? {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
        }
      : undefined,
    costUsd: costUsd ?? null,
    sessionParams: persistSession
      ? {
          sessionId,
          model,
          provider,
          cwd,
        }
      : null,
    resultJson: {
      status: result.errorMessage ? 'failed' : 'completed',
      stopReason: result.timedOut ? 'timeout' : result.exitCode === 0 ? 'completed' : 'error',
      totalTimeMs: Date.now() - startTime,
    },
    summary: result.summary?.slice(0, 2000) || result.errorMessage || null,
  };

  // Log completion
  await ctx.onLog(
    'stdout',
    `[upup] Exit code: ${result.exitCode}, timed out: ${result.timedOut}, tokens: ${result.usage?.inputTokens ?? 0}/${result.usage?.outputTokens ?? 0}\n`,
  );

  return executionResult;
}