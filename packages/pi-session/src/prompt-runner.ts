import type { AgentMessage } from '@earendil-works/pi-agent-core';
import type { Model } from '@earendil-works/pi-ai';
import type { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { validateAgentSpec } from '@upup/pi-runtime';
import type { UpUpAgentEvent, UpUpAgentSpec, UpUpAgentSession, UpUpToolSafetyLevel } from '@upup/pi-runtime';
import { getConfiguredModelId, getSetting, resolveProvider } from '@upup/utils';
import { findPiSessionFile, getPiSessionService } from './session-registry';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mergePiPackageTrust, resolveConfiguredPiPackages } from '@upup/pi-resource-composition';
import type { PiPackageTrustPolicy } from '@upup/pi-runtime';
import type { PiRunnerSessionState } from './session-registry';
import { resolveDefaultUserSkillScope, USER_SKILLS_SETTING_KEY } from './skill-scope';

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
    safetyLevel: UpUpToolSafetyLevel;
    auditId: string;
    permissionProfile: string;
  }) => boolean | Promise<boolean>;
  piPackagePaths?: readonly string[];
  piPackageTrust?: PiPackageTrustPolicy;
  agentSpec?: UpUpAgentSpec;
}

function ensurePiSessionService(): ReturnType<typeof getPiSessionService> {
  return getPiSessionService();
}

function specFingerprint(spec: UpUpAgentSpec): string {
  return createHash('sha256').update(JSON.stringify(spec)).digest('hex');
}

const SPEC_ENTRY = 'upup_agent_spec';

function persistedSpecFingerprint(sessionPath: string): string | undefined {
  try {
    const entries = readFileSync(sessionPath, 'utf8').split('\n').filter(Boolean);
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = JSON.parse(entries[index]) as { type?: string; customType?: string; data?: { hash?: unknown } };
      if (entry.type === 'custom' && entry.customType === SPEC_ENTRY && typeof entry.data?.hash === 'string') {
        return entry.data.hash;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function toPiSessionId(sessionKey: string): string {
  const normalized = sessionKey.replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
  if (normalized.length > 0 && normalized.length <= 128) return normalized;
  return `upup-${createHash('sha256').update(sessionKey).digest('hex').slice(0, 32)}`;
}

function createSpec(options: PiPromptOptions): UpUpAgentSpec {
  // `DEFAULT_MODEL` (env) wins for explicit operators; otherwise resolve the
  // model the user is actually configured for instead of the historical
  // DeepSeek fixture, which has no credentials on a MiniMax/Anthropic install.
  const model = options.model ?? process.env.DEFAULT_MODEL ?? getConfiguredModelId();
  if (options.agentSpec) {
    const configuredTools = options.agentSpec.tools === '*'
      ? '*'
      : [...options.agentSpec.tools];
    const tools = options.toolFilter && options.toolFilter !== '*'
      ? configuredTools === '*'
        ? options.toolFilter
        : configuredTools.filter((tool) => options.toolFilter?.includes(tool))
      : configuredTools;
    const spec: UpUpAgentSpec = {
      ...options.agentSpec,
      ...(options.systemPrompt !== undefined ? { systemPrompt: options.systemPrompt } : {}),
      ...(options.model ? { model: options.model } : {}),
      tools,
    };
    validateAgentSpec(spec);
    return spec;
  }
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
    // Curated by default: the ambient `~/.agents/skills` library is opt-in.
    // Leaving it on folded 227 unrelated skills (~24.7k tokens) into every
    // system prompt. See `resolveDefaultUserSkillScope`.
    userSkills: resolveDefaultUserSkillScope(
      process.env,
      getSetting<string | undefined>(USER_SKILLS_SETTING_KEY, undefined),
    ),
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

async function createPromptSession(options: PiPromptOptions, spec: UpUpAgentSpec): Promise<UpUpAgentSession> {
  const cwd = options.cwd ?? process.cwd();
  const sessionId = options.sessionKey ? toPiSessionId(options.sessionKey) : undefined;
  const existingSessionPath = sessionId
    ? await findPiSessionFile(sessionId, cwd, process.env.UPUP_SESSION_DIR)
    : undefined;
  const fingerprint = specFingerprint(spec);
  const persisted = existingSessionPath ? persistedSpecFingerprint(existingSessionPath) : undefined;
  if (persisted && persisted !== fingerprint) {
    throw new Error(`Pi session key ${options.sessionKey ?? sessionId} is persisted with a different AgentSpec; use a new session key when changing profile, permissions, or tools`);
  }
  const configuredPackages = options.piPackagePaths === undefined ? resolveConfiguredPiPackages(cwd) : undefined;
  const piPackagePaths = options.piPackagePaths ?? configuredPackages?.piPackagePaths;
  const piPackageTrust = options.piPackagePaths === undefined
    ? mergePiPackageTrust(configuredPackages?.piPackageTrust, options.piPackageTrust)
    : options.piPackageTrust;
  const session = await getPiSessionService().runtime.createSession(spec, {
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
  if (!persisted) session.appendEntry(SPEC_ENTRY, { hash: fingerprint, agentId: spec.id, version: spec.version });
  return session;
}

export function isPiSessionRunning(sessionKey: string): boolean {
  return ensurePiSessionService().getRunnerRegistry().isRunning(sessionKey);
}

export interface PiSessionToolInfo {
  name: string;
  description: string;
}

export function getPiSessionTools(sessionKey: string): readonly PiSessionToolInfo[] {
  return ensurePiSessionService().getRunnerRegistry().getTools(sessionKey);
}

// Per-turn tracing used by the TUI to pinpoint where wall-clock is being
// spent when the user-perceived latency diverges from the model round-trip.
// Set `UPUP_TRACE_TURN=1` to emit a labelled timeline to stderr; pair it with
// `PI_TIMING=1` (Pi's own startup timings) when investigating cold-start.
const TURN_TRACE = process.env.UPUP_TRACE_TURN === '1';
function turnTrace(label: string, t0: number, tPrev?: number): void {
  if (!TURN_TRACE) return;
  const now = Date.now();
  process.stderr.write(
    `[upup-trace] ${label} +${now - (tPrev ?? t0)}ms (Δtotal +${now - t0}ms)
`,
  );
}

export async function runPiPrompt(prompt: string, options: PiPromptOptions = {}): Promise<string> {
  const tTurn = Date.now();
  const key = options.sessionKey;
  const registry = ensurePiSessionService().getRunnerRegistry();
  const requestedSpec = createSpec(options);
  const tSpec = Date.now();
  turnTrace('buildSpec', tTurn, tSpec);
  const requestedSpecHash = specFingerprint(requestedSpec);
  let state = key ? registry.get(key) : undefined;
  if (state && state.specHash !== requestedSpecHash) {
    throw new Error(`Pi session key ${key} is already bound to a different AgentSpec; use a new session key when changing profile, permissions, or tools`);
  }
  let tSession: number | undefined;
  if (!state) {
    const pending = key ? registry.getInitialization(key) : undefined;
    if (pending) {
      if (pending.specHash !== requestedSpecHash) {
        throw new Error(`Pi session key ${key} is initializing with a different AgentSpec; use a new session key when changing profile, permissions, or tools`);
      }
      state = await pending.promise;
    } else if (key) {
      const promise = createPromptSession(options, requestedSpec).then((session) => {
        const initialized: PiRunnerSessionState = { session, tail: Promise.resolve(), running: false, specHash: requestedSpecHash };
        registry.set(key, initialized);
        return initialized;
      });
      registry.setInitialization(key, { specHash: requestedSpecHash, promise });
      try {
        state = await promise;
      } finally {
        registry.clearInitialization(key, promise);
      }
    } else {
      const session = await createPromptSession(options, requestedSpec);
      state = { session, tail: Promise.resolve(), running: false, specHash: requestedSpecHash };
    }
    tSession = Date.now();
    turnTrace('createSession', tTurn, tSession);
  } else {
    turnTrace('reuseSession', tTurn, tSpec);
  }
  const current = state;
  if (!current) throw new Error('Pi prompt session was not initialized');
  let answer = '';
  let firstTokenAt: number | undefined;
  const run = async () => {
    current.running = true;
    // Pi canonical stream emits raw `text_delta`/`thinking_delta`/`toolcall_start`
    // events; the typed `UpUpAgentEvent` union collapses them into
    // `message_end`/`thinking`/`tool_start`, so a precise first-content marker
    // has to look at the raw shape. The cast keeps the trace accurate without
    // widening the public UpUp type.
    const unsubscribe = options.onEvent
      ? current.session.subscribe((event) => {
          const rawType = (event as { type?: string }).type;
          if (
            !firstTokenAt &&
            (rawType === 'text_delta' || rawType === 'thinking_delta' || rawType === 'toolcall_start')
          ) {
            firstTokenAt = Date.now();
            turnTrace('firstToken', tTurn, firstTokenAt);
          }
          return options.onEvent?.(event);
        })
      : undefined;
    try {
      const tPrompt = Date.now();
      await current.session.prompt(prompt, { signal: options.signal });
      turnTrace('session.prompt() resolved', tTurn, tPrompt);
      await current.session.waitForIdle();
      turnTrace('session.waitForIdle() resolved', tTurn);
      answer = answerFromSession(current.session);
    } finally {
      unsubscribe?.();
      current.running = false;
    }
  };
  current.tail = current.tail.then(run, run);
  await current.tail;
  if (TURN_TRACE && firstTokenAt) {
    turnTrace('promptSession→firstToken (TTFB)', tTurn, firstTokenAt);
  }
  turnTrace('runDone', tTurn);
  if (!key) current.session.dispose();
  return answer;
}

export function disposePiSessions(): void {
  try {
    ensurePiSessionService().getRunnerRegistry().dispose();
  } catch {
    // PiApp may dispose before the session composition has been initialized.
  }
}
