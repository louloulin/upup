/**
 * Core execution logic for the UpUp Paperclip adapter.
 *
 * Uses subprocess spawning to communicate with the UpUp agent,
 * avoiding workspace dependency issues when loaded by Paperclip.
 */

import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
  UsageSummary,
} from '@paperclipai/adapter-utils';

import { buildPaperclipEnv, renderTemplate } from '@paperclipai/adapter-utils/server-utils';

import { spawn } from 'child_process';
import { Readable } from 'stream';

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

import type { UpupAdapterConfig, AcpxLogEntry } from '../shared/types.js';

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
// JSON-RPC helpers for subprocess communication
// ---------------------------------------------------------------------------

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

function createJsonRpcRequest(method: string, params: Record<string, unknown> = {}): JsonRpcRequest {
  return {
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params,
  };
}

// ---------------------------------------------------------------------------
// Subprocess executor
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

async function runAgentSubprocess(
  prompt: string,
  model: string,
  maxIterations: number,
  timeoutMs: number,
  cwd: string,
  env: Record<string, string>,
): Promise<SubprocessResult> {
  return new Promise((resolve) => {
    const output: string[] = [];
    let timedOut = false;
    let exitCode = 0;
    let signal: string | null = null;

    // Build environment
    const spawnEnv = {
      ...process.env,
      ...env,
      DEFAULT_MODEL: model,
    };

    // Spawn the agent using bun run
    // This will run the UpUp agent with the provided prompt
    const child = spawn('bun', ['run', 'src/index.ts'], {
      cwd,
      env: spawnEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    // Send the run request via JSON-RPC
    const request = createJsonRpcRequest('run', {
      prompt,
      model,
      maxIterations,
    });

    if (child.stdin) {
      child.stdin.write(JSON.stringify(request) + '\n');
      child.stdin.end();
    }

    let usage: { inputTokens: number; outputTokens: number } | undefined;
    let summary: string | undefined;

    // Collect stdout
    if (child.stdout) {
      const reader = Readable.toWeb(child.stdout) as ReadableStream<string>;
      const decoder = new TextDecoder();

      reader.pipeThrough(new TransformStream({
        transform(chunk, controller) {
          const text = decoder.decode(chunk);
          output.push(text);

          // Try to parse JSON-RPC responses
          try {
            const lines = text.split('\n').filter(Boolean);
            for (const line of lines) {
              try {
                const msg = JSON.parse(line);
                if (msg.method === 'event' && msg.params?.event?.type === 'done') {
                  usage = {
                    inputTokens: msg.params.event.tokenUsage?.inputTokens || 0,
                    outputTokens: msg.params.event.tokenUsage?.outputTokens || 0,
                  };
                  summary = msg.params.event.answer;
                }
              } catch {}
            }
          } catch {}
          controller.enqueue(chunk);
        },
      }));
    }

    child.on('close', (code, sig) => {
      clearTimeout(timeoutTimer);
      exitCode = code || 0;
      signal = sig;
      resolve({
        exitCode,
        signal,
        timedOut,
        errorMessage: timedOut ? `Execution timed out after ${timeoutMs}ms` : undefined,
        output: output.join(''),
        usage,
        summary,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timeoutTimer);
      resolve({
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: err.message,
        output: output.join(''),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Simple agent runner (direct execution in same process)
// This is used when the adapter is loaded within the UpUp workspace
// ---------------------------------------------------------------------------

async function runAgentDirect(
  prompt: string,
  model: string,
  maxIterations: number,
  timeoutMs: number,
  ctx: AdapterExecutionContext,
): Promise<SubprocessResult> {
  // Dynamically import to avoid issues when adapter is loaded standalone
  const { Agent } = await import('@upup/agent-core');
  const { calculateTokenCost } = await import('@upup/state');

  const startTime = Date.now();
  let usage: { inputTokens: number; outputTokens: number } | undefined;
  let summary: string | undefined;

  const abortController = new AbortController();
  const timeoutTimer = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);

  try {
    const agent = await Agent.create({
      model,
      maxIterations,
      signal: abortController.signal,
    });

    const stream = agent.run(prompt);

    for await (const event of stream) {
      switch (event.type) {
        case 'thinking':
          await emitAcpxLog(ctx, {
            type: 'acpx.text_delta',
            text: event.message,
            channel: 'thought',
          });
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
            text: event.result.slice(0, 500),
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
          usage = {
            inputTokens: event.tokenUsage?.inputTokens || 0,
            outputTokens: event.tokenUsage?.outputTokens || 0,
          };
          summary = event.answer;
          await emitAcpxLog(ctx, {
            type: 'acpx.result',
            summary: event.answer.slice(0, 200),
            stopReason: `completed_after_${event.iterations}_iterations`,
          });
          break;
      }
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
    const error = err as Error;
    if (error.name === 'AbortError') {
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
      errorMessage: error.message,
      output: '',
    };
  } finally {
    clearTimeout(timeoutTimer);
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

  // Build Paperclip environment variables
  const paperclipEnv = buildPaperclipEnv({
    id: ctx.agent?.id || '',
    companyId: ctx.agent?.companyId || '',
  });

  // Log start
  await ctx.onLog(
    'stdout',
    `[upup] Starting UpUp Agent (model=${model}, provider=${provider}, timeout=${timeoutSec}s)\n`,
  );

  // Extract session params for resume
  const prevSessionParams = ctx.runtime.sessionParams as Record<string, unknown> | null;
  const prevSessionId = cfgString(prevSessionParams?.sessionId);
  if (prevSessionId) {
    await ctx.onLog('stdout', `[upup] Resuming session: ${prevSessionId}\n`);
  }

  // Try direct execution first (when @upup/agent-core is available)
  // Fall back to subprocess if imports fail
  let result: SubprocessResult;

  try {
    result = await runAgentDirect(prompt, model, maxIterations, timeoutMs, ctx);
  } catch {
    // Direct import failed, try subprocess
    result = await runAgentSubprocess(prompt, model, maxIterations, timeoutMs, cwd, {
      ...process.env,
      ...paperclipEnv,
    });
  }

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
