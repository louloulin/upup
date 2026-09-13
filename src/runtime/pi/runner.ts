import type { AgentMessage } from '@earendil-works/pi-agent-core';
import type { Model } from '@earendil-works/pi-ai';
import type { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { createPiAgentRuntime } from './agent-session-factory.js';
import { validateAgentSpec } from './agent-spec.js';
import type { UpUpAgentEvent, UpUpAgentSpec, UpUpAgentSession } from './types.js';
import { resolveProvider } from '../../providers.js';
import { getPiSessionService } from './session-service.js';
import { createHash } from 'node:crypto';
import { resolveConfiguredPiPackages } from './package-config.js';
import type { PiPluginTrustPolicy } from './plugin-trust.js';

export interface PiPromptOptions {
  model?: string;
  modelProvider?: string;
  cwd?: string;
  sessionKey?: string;
  signal?: AbortSignal;
  onEvent?: (event: UpUpAgentEvent) => void | Promise<void>;
  maxIterations?: number;
  toolFilter?: string[] | '*';
  systemPrompt?: string;
  modelInstance?: Model<any>;
  modelRuntime?: ModelRuntime;
  requestToolApproval?: (request: {
    tool: string;
    input: unknown;
    safetyLevel: import('./types.js').UpUpToolSafetyLevel;
    auditId: string;
    permissionProfile: string;
  }) => boolean | Promise<boolean>;
  piPackagePaths?: readonly string[];
  piPackageTrust?: PiPluginTrustPolicy;
}

const sessions = new Map<string, { session: UpUpAgentSession; tail: Promise<void>; running: boolean }>();
const runtime = createPiAgentRuntime();

export function toPiSessionId(sessionKey: string): string {
  const normalized = sessionKey.replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
  if (normalized.length > 0 && normalized.length <= 128) return normalized;
  return `upup-${createHash('sha256').update(sessionKey).digest('hex').slice(0, 32)}`;
}

function createSpec(options: PiPromptOptions): UpUpAgentSpec {
  const model = options.model ?? process.env.DEFAULT_MODEL ?? 'deepseek-v4-flash';
  const spec: UpUpAgentSpec = {
    id: 'upup-primary',
    version: '1.0.0',
    name: 'UpUp Pi Primary',
    description: 'Primary UpUp investment research session powered by Pi.',
    model: options.modelProvider && resolveProvider(model).id !== options.modelProvider ? `${options.modelProvider}:${model}` : model,
    ...(options.systemPrompt ? { systemPrompt: options.systemPrompt } : {}),
    tools: '*',
    mode: 'primary',
    capabilities: ['financial-research', 'investment-analysis', 'evidence-reporting'],
    taskTypes: ['research', 'invest', 'screen', 'risk'],
    permissions: {
      id: 'upup-readonly-primary',
      allow: ['safe', 'warning'],
      requireApproval: ['dangerous', 'critical'],
      deny: [],
      allowExternalNetwork: true,
      allowCredentialAccess: false,
      allowFinancialWrites: false,
    },
    thinkingLevel: 'medium',
    dataPolicy: 'live',
    outputContract: 'report',
  };
  if (options.toolFilter && options.toolFilter !== '*') spec.tools = options.toolFilter;
  validateAgentSpec(spec);
  return spec;
}

function textFromMessage(message: AgentMessage): string {
  if (!('content' in message) || !Array.isArray(message.content)) return '';
  return message.content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');
}

function answerFromSession(session: UpUpAgentSession): string {
  const messages = session.getMessages() as readonly AgentMessage[];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'assistant') return textFromMessage(messages[index]);
  }
  return '';
}

async function createPromptSession(options: PiPromptOptions): Promise<UpUpAgentSession> {
  const cwd = options.cwd ?? process.cwd();
  const sessionId = options.sessionKey ? toPiSessionId(options.sessionKey) : undefined;
  const existingSessionPath = sessionId
    ? await getPiSessionService().getSessionFile(sessionId, cwd)
    : undefined;
  const configuredPackages = options.piPackagePaths === undefined ? resolveConfiguredPiPackages() : undefined;
  const piPackagePaths = options.piPackagePaths ?? configuredPackages?.piPackagePaths;
  const piPackageTrust = options.piPackageTrust ?? configuredPackages?.piPackageTrust;
  return runtime.createSession(createSpec(options), {
    cwd,
    ...(existingSessionPath ? { sessionPath: existingSessionPath } : {}),
    ...(sessionId && !existingSessionPath ? { sessionId } : {}),
    ...(sessionId ? { sessionDir: process.env.UPUP_SESSION_DIR ?? `${cwd}/.upup/sessions` } : {}),
    ...(options.modelInstance ? { model: options.modelInstance } : {}),
    ...(options.modelRuntime ? { modelRuntime: options.modelRuntime } : {}),
    ...(options.requestToolApproval ? { requestToolApproval: options.requestToolApproval } : {}),
    ...(piPackagePaths?.length ? { piPackagePaths } : {}),
    ...(piPackageTrust ? { piPackageTrust } : {}),
  });
}

export function isPiSessionRunning(sessionKey: string): boolean {
  return sessions.get(sessionKey)?.running ?? false;
}

export async function runPiPrompt(prompt: string, options: PiPromptOptions = {}): Promise<string> {
  const key = options.sessionKey;
  let state = key ? sessions.get(key) : undefined;
  if (!state) {
    const session = await createPromptSession(options);
    state = { session, tail: Promise.resolve(), running: false };
    if (key) sessions.set(key, state);
  }
  const current = state;
  let answer = '';
  const run = async () => {
    current.running = true;
    const unsubscribe = options.onEvent ? current.session.subscribe(options.onEvent) : undefined;
    try {
      await current.session.prompt(prompt, { signal: options.signal });
      await current.session.waitForIdle();
      answer = answerFromSession(current.session);
    } finally {
      unsubscribe?.();
      current.running = false;
    }
  };
  current.tail = current.tail.then(run, run);
  await current.tail;
  if (!key) current.session.dispose();
  return answer;
}

export function disposePiSessions(): void {
  for (const state of sessions.values()) state.session.dispose();
  sessions.clear();
}
