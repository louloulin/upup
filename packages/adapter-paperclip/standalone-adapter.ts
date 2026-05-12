/**
 * Standalone UpUp Paperclip Adapter
 *
 * This is a standalone adapter module that Paperclip can load directly.
 * It spawns the UpUp agent as a subprocess using runChildProcess from adapter-utils.
 *
 * Usage:
 *   npm run build:standalone
 *   POST to Paperclip API to install from local path
 */

import { runChildProcess } from '@paperclipai/adapter-utils/server-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdapterExecutionContext {
  runId: string;
  agent: {
    id: string;
    companyId: string;
    name: string;
    adapterType: string | null;
    adapterConfig: unknown;
  };
  runtime: {
    sessionId: string | null;
    sessionParams: Record<string, unknown> | null;
    sessionDisplayId: string | null;
    taskKey: string | null;
  };
  config: Record<string, unknown>;
  context: Record<string, unknown>;
  onLog: (stream: 'stdout' | 'stderr', chunk: string) => Promise<void>;
}

interface AdapterExecutionResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  errorMessage?: string | null;
  errorCode?: string | null;
  errorFamily?: string | null;
  usage?: { inputTokens: number; outputTokens: number };
  sessionParams?: Record<string, unknown> | null;
  provider?: string | null;
  model?: string | null;
  billingType?: string | null;
  costUsd?: number | null;
  summary?: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = 'deepseek-v4-flash';
const DEFAULT_TIMEOUT_SEC = 1800;
const DEFAULT_MAX_ITERATIONS = 50;

const DEFAULT_PROMPT_TEMPLATE = `You are "{{agentName}}", an AI agent specializing in financial research and investment analysis, managed by Paperclip.

Your Paperclip identity:
  Agent ID: {{agentId}}
  Company ID: {{companyId}}
  API Base: {{paperclipApiUrl}}

{{#taskId}}
## Assigned Task
Issue ID: {{taskId}}
Title: {{taskTitle}}
{{taskBody}}

## Workflow
1. Use your financial research tools to complete the task
2. Mark issue as completed via Paperclip API
3. Post completion summary as a comment
{{/taskId}}

{{#noTask}}
## Heartbeat Wake — Check for Work
1. List open issues assigned to you
2. Prioritize financial research tasks
3. Work on highest priority item
4. Report findings concisely
{{/noTask}}

Specialized capabilities:
- Financial data analysis (US + A-share markets)
- Quantitative modeling and backtesting
- Investment portfolio analysis
- Company valuation (DCF, comparables)
- Web research for financial information
`;

const MODEL_PROVIDER_MAP: Record<string, string> = {
  'deepseek-v4-flash': 'deepseek',
  'deepseek-chat': 'deepseek',
  'claude-sonnet-4-6': 'anthropic',
  'claude-opus-4-7': 'anthropic',
  'gpt-4o': 'openai',
  'gpt-4.5': 'openai',
};

function inferProvider(model: string): string {
  return MODEL_PROVIDER_MAP[model] || 'deepseek';
}

function renderTemplate(template: string, data: Record<string, unknown>): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value || ''));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildPrompt(ctx: AdapterExecutionContext): string {
  const taskId = ctx.config?.taskId as string | undefined;
  const taskTitle = (ctx.config?.taskTitle as string) || '';
  const taskBody = (ctx.config?.taskBody as string) || '';

  let prompt = DEFAULT_PROMPT_TEMPLATE;

  // Replace conditional sections
  prompt = prompt.replace(
    /\{\{#taskId\}\}([\s\S]*?)\{\{\/taskId\}\}/g,
    taskId ? '$1' : '',
  );
  prompt = prompt.replace(
    /\{\{#noTask\}\}([\s\S]*?)\{\{\/noTask\}\}/g,
    taskId ? '' : '$1',
  );

  // Replace variables
  prompt = prompt.replace(/\{\{agentId\}\}/g, ctx.agent?.id || '');
  prompt = prompt.replace(/\{\{agentName\}\}/g, ctx.agent?.name || 'UpUp Agent');
  prompt = prompt.replace(/\{\{companyId\}\}/g, ctx.agent?.companyId || '');
  prompt = prompt.replace(/\{\{taskId\}\}/g, taskId || '');
  prompt = prompt.replace(/\{\{taskTitle\}\}/g, taskTitle);
  prompt = prompt.replace(/\{\{taskBody\}\}/g, taskBody);
  prompt = prompt.replace(/\{\{paperclipApiUrl\}\}/g, 'http://127.0.0.1:3100/api');

  return prompt;
}

// ---------------------------------------------------------------------------
// Main execute function
// ---------------------------------------------------------------------------

async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const startTime = Date.now();

  // Extract config
  const model = (ctx.config?.model as string) || process.env.DEFAULT_MODEL || DEFAULT_MODEL;
  const provider = inferProvider(model);
  const timeoutSec = (ctx.config?.timeoutSec as number) || DEFAULT_TIMEOUT_SEC;
  const maxIterations = (ctx.config?.maxIterations as number) || DEFAULT_MAX_ITERATIONS;
  const persistSession = ctx.config?.persistSession !== false;

  // Build prompt
  const prompt = buildPrompt(ctx);

  // Log start
  await ctx.onLog('stdout', `[upup] Starting UpUp Agent (model=${model}, provider=${provider}, timeout=${timeoutSec}s)\n`);

  // Extract session params for resume
  const prevSessionId = ctx.runtime.sessionParams?.sessionId as string | undefined;
  if (prevSessionId) {
    await ctx.onLog('stdout', `[upup] Resuming session: ${prevSessionId}\n`);
  }

  // Get project root - the directory containing UpUp source
  // Use DEXTER_ROOT or determine from the adapter location
  const projectRoot = process.env.DEXTER_ROOT || '/Users/louloulin/Documents/linchong/touzhi/dexter';

  // Buffer for stdout parsing
  let usage: { inputTokens: number; outputTokens: number } | undefined;
  let summary: string | undefined;

  // Run the agent subprocess using runChildProcess (proper Paperclip integration)
  const proc = await runChildProcess(
    ctx.runId,
    'bun',
    ['run', 'src/run.ts', prompt],
    {
      cwd: projectRoot,
      env: { ...process.env, DEFAULT_MODEL: model },
      timeoutSec,
      graceSec: 10, // Grace period before SIGKILL
      stdin: prompt, // Pass prompt via stdin
      onLog: async (stream, chunk) => {
        await ctx.onLog(stream, chunk);

        // Parse ACPX events from stdout
        if (stream === 'stdout') {
          const lines = chunk.split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const msg = JSON.parse(line);
              if (msg.type === 'acpx.result') {
                usage = msg.usage;
                summary = msg.summary;
              }
            } catch {}
          }
        }
      },
    },
  );

  // Determine exit status
  const resultExitCode = proc.exitCode ?? 0;
  const isTimeout = proc.timedOut;

  // Build session params
  const sessionId = resultExitCode === 0 && summary
    ? `upup-session-${startTime}`
    : prevSessionId || `upup-session-${startTime}`;

  // Log completion
  await ctx.onLog(
    'stdout',
    `[upup] Exit code: ${resultExitCode}, timed out: ${isTimeout}, tokens: ${usage?.inputTokens ?? 0}/${usage?.outputTokens ?? 0}\n`,
  );

  return {
    exitCode: resultExitCode,
    signal: proc.signal,
    timedOut: isTimeout,
    errorMessage: proc.stderr || null,
    provider,
    model,
    billingType: 'api',
    usage,
    sessionParams: persistSession ? { sessionId, model, provider } : null,
    summary: summary?.slice(0, 2000) || proc.stderr || null,
  };
}

// ---------------------------------------------------------------------------
// Environment test
// ---------------------------------------------------------------------------

async function testEnvironment(): Promise<Array<{ code: string; level: string; message: string }>> {
  const checks: Array<{ code: string; level: string; message: string }> = [];

  // Check bun using import.meta.url to check for binary
  try {
    const { readFileSync, existsSync } = await import('fs');
    // Check if bun is in PATH by trying to use it
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const { execSync } = require('child_process');
    execSync('bun --version', { encoding: 'utf-8', stdio: 'pipe' });
    checks.push({ code: 'BUN', level: 'info', message: 'bun runtime installed' });
  } catch {
    checks.push({ code: 'BUN', level: 'error', message: 'bun not found - required' });
  }

  // Check Node
  checks.push({
    code: 'NODE',
    level: process.version >= 'v20' ? 'info' : 'warn',
    message: `Node ${process.version}`,
  });

  // Check model
  const model = process.env.DEFAULT_MODEL;
  checks.push({
    code: 'MODEL',
    level: model ? 'info' : 'warn',
    message: model ? `default: ${model}` : 'not set - will use provider default',
  });

  // Check API keys
  for (const [key, name] of [
    ['ANTHROPIC_API_KEY', 'Anthropic'],
    ['DEEPSEEK_API_KEY', 'DeepSeek'],
    ['OPENAI_API_KEY', 'OpenAI'],
  ]) {
    checks.push({
      code: key,
      level: process.env[key] ? 'info' : 'warn',
      message: process.env[key] ? 'configured' : `not set (${name})`,
    });
  }

  return checks;
}

// ---------------------------------------------------------------------------
// Model detection
// ---------------------------------------------------------------------------

async function detectModel(): Promise<{ model: string; provider: string }> {
  const model = process.env.DEFAULT_MODEL || DEFAULT_MODEL;
  return { model, provider: inferProvider(model) };
}

// ---------------------------------------------------------------------------
// Session codec
// ---------------------------------------------------------------------------

const sessionCodec = {
  deserialize(raw: unknown): Record<string, unknown> | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    if (!obj.sessionId && obj.sessionId !== 0) return null;
    if (typeof obj.sessionId === 'number') {
      return { ...obj, sessionId: String(obj.sessionId) };
    }
    return obj;
  },
  serialize(params: Record<string, unknown> | null): Record<string, unknown> | null {
    return params ?? {};
  },
  getDisplayId(params: Record<string, unknown> | null): string | null {
    if (!params) return null;
    const id = params.sessionId;
    if (id === undefined || id === null) return null;
    const strId = typeof id === 'number' ? String(id) : (id as string);
    return strId.slice(0, 16);
  },
};

// ---------------------------------------------------------------------------
// Model list
// ---------------------------------------------------------------------------

const models = [
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
  { id: 'deepseek-chat', label: 'DeepSeek Chat' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'gpt-4.5', label: 'GPT-4.5' },
];

// ---------------------------------------------------------------------------
// Adapter module export
// ---------------------------------------------------------------------------

function createServerAdapter() {
  return {
    type: 'upup_local',
    label: 'UpUp Agent',
    models,
    modelProfiles: [], // External adapters don't support model profiles yet
    capabilities: {
      supportsInstructionsBundle: false,
      supportsSkills: false,
      supportsLocalAgentJwt: false,
      requiresMaterializedRuntimeSkills: false,
      supportsModelProfiles: false,
    },
    agentConfigurationDoc: `
# UpUp Agent Configuration

## Overview
UpUp is a financial research AI agent that can analyze investments, run quantitative models, and research companies.

## Model
The default model is **DeepSeek V4 Flash** (optimized for speed and cost).

## Execution Settings
- Timeout: Maximum execution time (default: 1800s)
- Max Iterations: Maximum agent iterations (default: 50)
- Session Persistence: Keep context across heartbeats

## Capabilities
- Financial data analysis (US + A-share markets)
- Quantitative modeling and backtesting
- Investment portfolio analysis
- Company valuation (DCF, comparables)
- Web research for financial information
`,
    execute,
    testEnvironment,
    sessionCodec,
    detectModel,
  };
}

export { createServerAdapter, execute, testEnvironment, sessionCodec, detectModel, models };
export default { createServerAdapter };