import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type AgentSessionEvent,
  type ExtensionAPI,
  type InlineExtension,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { canUseTool, createToolContext, requiresApproval } from './tool-contract.js';
import type {
  UpUpAgentRuntime,
  UpUpAgentSession,
  UpUpAgentSpec,
  UpUpCreateSessionOptions,
  UpUpToolContract,
  UpUpAgentEvent,
  UpUpToolPolicyAudit,
} from './types.js';
import { validateAgentSpec } from './agent-spec.js';
import { getModel, getModels } from '@earendil-works/pi-ai/compat';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { PI_DEFAULT_SYSTEM_PROMPT } from './default-prompt.js';
import { verifyPiResourceTrust, type PiResourceTrustAudit } from './plugin-trust.js';
import { createPiPluginExtensions, getLoadedPiPluginBindings } from './plugin-adapter.js';
import { PiPackageCatalog, type PiPackageResourceSnapshot } from './package-catalog.js';
import { evaluatePiPackage, type PiEvalResult, type PiPackageContracts } from './package-contracts.js';
import { getBuiltinPiPackageOptions } from './package-config.js';

function eventToUpUpEvent(sessionId: string, event: AgentSessionEvent): UpUpAgentEvent | undefined {
  switch (event.type) {
    case 'agent_start':
      return { type: 'agent_start', sessionId };
    case 'turn_start':
      return { type: 'turn_start', sessionId };
    case 'message_update':
      if (event.assistantMessageEvent.type === 'text_delta') {
        return { type: 'text_delta', sessionId, delta: event.assistantMessageEvent.delta };
      }
      if (event.assistantMessageEvent.type === 'thinking_delta') {
        return { type: 'thinking', sessionId, text: event.assistantMessageEvent.delta };
      }
      return undefined;
    case 'message_end': {
      const message = event.message as { role?: string; content?: unknown; stopReason?: string };
      return {
        type: 'message_end',
        sessionId,
        role: message.role ?? 'unknown',
        text: contentToText(message),
        stopReason: message.stopReason,
      };
    }
    case 'tool_execution_start':
      return {
        type: 'tool_start',
        sessionId,
        toolName: event.toolName,
        toolCallId: event.toolCallId,
        input: event.args,
      };
    case 'tool_execution_update':
      return {
        type: 'tool_update',
        sessionId,
        toolName: event.toolName,
        text: contentToText(event.partialResult),
      };
    case 'tool_execution_end':
      return {
        type: 'tool_end',
        sessionId,
        toolName: event.toolName,
        toolCallId: event.toolCallId,
        error: event.isError ? contentToText(event.result) : undefined,
      };
    case 'compaction_start':
      return { type: 'compaction_start', sessionId, reason: event.reason };
    case 'compaction_end':
      return { type: 'compaction_end', sessionId, success: !event.errorMessage && !event.aborted, error: event.errorMessage };
    case 'agent_end': {
      const failed = event.messages.find((message) => message.role === 'assistant' && ('stopReason' in message) && (message.stopReason === 'error' || message.stopReason === 'aborted'));
      return failed && 'errorMessage' in failed && typeof failed.errorMessage === 'string'
        ? { type: 'session_error', sessionId, error: failed.errorMessage }
        : { type: 'agent_end', sessionId };
    }
    case 'turn_end':
      return { type: 'turn_end', sessionId };
    default:
      return undefined;
  }
}

function contentToText(result: unknown): string {
  if (!result || typeof result !== 'object' || !('content' in result) || !Array.isArray(result.content)) {
    return '';
  }
  return result.content
    .filter((part: unknown): part is { type: 'text'; text: string } =>
      typeof part === 'object' && part !== null && 'type' in part && part.type === 'text' && 'text' in part && typeof part.text === 'string',
    )
    .map((part) => part.text)
    .join('\n');
}

export function toPiTool<TInput, TResult>(
  spec: UpUpAgentSpec,
  tool: UpUpToolContract<TInput, TResult>,
  requestToolApproval?: UpUpCreateSessionOptions['requestToolApproval'],
): ToolDefinition {
  return {
    name: tool.name,
    label: tool.label,
    description: tool.description,
    promptSnippet: tool.description,
    parameters: tool.parameters,
    executionMode: tool.maxConcurrent === 1 ? 'sequential' : 'parallel',
    async execute(toolCallId, params, signal, onUpdate) {
      const auditId = createToolContext(spec, toolCallId, signal ?? new AbortController().signal).auditId;
      const policyAudit = (
        decision: UpUpToolPolicyAudit['decision'],
        reason: string,
      ): UpUpToolPolicyAudit => ({
        auditId,
        tool: tool.name,
        safetyLevel: tool.safetyLevel,
        permissionProfile: spec.permissions.id,
        decision,
        reason,
        recordedAt: new Date().toISOString(),
      });
      if (!canUseTool(spec.permissions, tool.safetyLevel)) {
        return {
          content: [{ type: 'text', text: `Tool ${tool.name} is denied by permission profile ${spec.permissions.id}` }],
          details: { auditId, policyAudit: policyAudit('denied', 'safety level is not allowed by the permission profile') },
          isError: true,
        };
      }
      if (requiresApproval(spec.permissions, tool.safetyLevel)) {
        const approved = requestToolApproval
          ? await requestToolApproval({
            tool: tool.name,
            input: params,
            safetyLevel: tool.safetyLevel,
            auditId,
            permissionProfile: spec.permissions.id,
          })
          : false;
        if (!approved) {
          return {
            content: [{ type: 'text', text: `Tool ${tool.name} requires explicit approval before execution` }],
            details: { auditId, policyAudit: policyAudit('approval_denied', requestToolApproval ? 'approval callback denied execution' : 'no approval callback was configured') },
            isError: true,
          };
        }
        const approvalAudit = policyAudit('approval_granted', 'approval callback granted execution');
        const context = createToolContext(spec, toolCallId, signal ?? new AbortController().signal, (update) => {
          onUpdate?.({ content: [{ type: 'text', text: update.text }], details: {} });
        });
        const result = await tool.execute(params as TInput, context);
        return {
          content: [{ type: 'text', text: result.text }],
          details: { ...(result.details ?? {}), auditId: result.details?.auditId ?? auditId, policyAudit: approvalAudit },
        };
      }
      const context = createToolContext(spec, toolCallId, signal ?? new AbortController().signal, (update) => {
        onUpdate?.({ content: [{ type: 'text', text: update.text }], details: {} });
      });
      const result = await tool.execute(params as TInput, context);
      return {
        content: [{ type: 'text', text: result.text }],
        details: {
          ...(result.details ?? {}),
          auditId: result.details?.auditId ?? auditId,
          policyAudit: policyAudit('allowed', 'safety level is allowed without per-call approval'),
        },
      };
    },
  };
}

function createFinanceExtension(spec: UpUpAgentSpec, tools: readonly UpUpToolContract[], requestToolApproval?: UpUpCreateSessionOptions['requestToolApproval']): InlineExtension {
  return {
    name: `upup-finance-${spec.id}`,
    hidden: true,
    factory: (pi: ExtensionAPI) => {
      for (const tool of tools) pi.registerTool(toPiTool(spec, tool, requestToolApproval));
    },
  };
}

const PI_FINANCE_HOST_KEY = '__upupPiFinanceToolHost';
let piFinancePackageLoadTail: Promise<void> = Promise.resolve();

function installPiFinanceToolHost(
  spec: UpUpAgentSpec,
  tools: readonly UpUpToolContract[],
  requestToolApproval?: UpUpCreateSessionOptions['requestToolApproval'],
): () => void {
  const globalState = globalThis as typeof globalThis & {
    __upupPiFinanceToolHost?: { getToolDefinitions: () => readonly ToolDefinition[] };
  };
  const previous = globalState[PI_FINANCE_HOST_KEY];
  globalState[PI_FINANCE_HOST_KEY] = {
    getToolDefinitions: () => tools.map((tool) => toPiTool(spec, tool, requestToolApproval)),
  };
  return () => {
    if (previous) globalState[PI_FINANCE_HOST_KEY] = previous;
    else delete globalState[PI_FINANCE_HOST_KEY];
  };
}

async function reloadFinancePackageResources(
  resourceLoader: DefaultResourceLoader,
  spec: UpUpAgentSpec,
  tools: readonly UpUpToolContract[],
  requestToolApproval?: UpUpCreateSessionOptions['requestToolApproval'],
): Promise<void> {
  const previous = piFinancePackageLoadTail;
  let release!: () => void;
  piFinancePackageLoadTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  const restore = installPiFinanceToolHost(spec, tools, requestToolApproval);
  try {
    await resourceLoader.reload();
  } finally {
    restore();
    release();
  }
}

function createFinanceSessionExtension(): InlineExtension {
  return {
    name: 'upup-finance-session-policy',
    hidden: true,
    factory: (pi: ExtensionAPI) => {
      pi.on('session_before_compact', async (event) => ({
        compaction: {
          summary: [
            'UpUp financial session summary:',
            'Preserve ticker, market, currency, as-of date, valuation assumptions, risk conclusions, evidence IDs, audit IDs, and unfinished workflow phases.',
            `Compaction reason: ${event.reason}.`,
            event.customInstructions ? `Additional instructions: ${event.customInstructions}` : '',
          ].filter(Boolean).join('\n'),
          firstKeptEntryId: event.preparation.firstKeptEntryId,
          tokensBefore: event.preparation.tokensBefore,
          details: { domain: 'investment', schema: 1 },
        },
      }));
    },
  };
}

class PiAgentSession implements UpUpAgentSession {
  readonly id: string;
  readonly spec: UpUpAgentSpec;
  private readonly listeners = new Set<(event: UpUpAgentEvent) => void>();
  private readonly session: AgentSession;
  private readonly unsubscribe: () => void;
  private readonly resourceTrustAudit: readonly PiResourceTrustAudit[];
  private readonly packageResources: readonly PiPackageResourceSnapshot[];
  private readonly packageContracts: PiPackageContracts;

  constructor(spec: UpUpAgentSpec, session: AgentSession, resourceTrustAudit: readonly PiResourceTrustAudit[], packageResources: readonly PiPackageResourceSnapshot[], packageContracts: PiPackageContracts) {
    this.id = session.sessionManager.getSessionId();
    this.spec = spec;
    this.resourceTrustAudit = resourceTrustAudit;
    this.packageResources = packageResources;
    this.packageContracts = packageContracts;
    this.session = session;
    this.unsubscribe = session.subscribe((event) => {
      const mapped = eventToUpUpEvent(this.id, event);
      if (mapped?.type === 'session_start') mapped.agentId = spec.id;
      if (mapped) for (const listener of this.listeners) listener(mapped);
    });
  }

  prompt(input: string, options?: { signal?: AbortSignal }): Promise<void> {
    if (options?.signal?.aborted) return this.abort();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const abortListener = () => void this.abort();
    options?.signal?.addEventListener('abort', abortListener, { once: true });
    if (this.spec.timeoutMs !== undefined) timeout = setTimeout(() => void this.abort(), this.spec.timeoutMs);
    return this.session.prompt(input).finally(() => {
      if (timeout) clearTimeout(timeout);
      options?.signal?.removeEventListener('abort', abortListener);
    });
  }

  steer(input: string): Promise<void> { return this.session.steer(input); }
  followUp(input: string): Promise<void> { return this.session.followUp(input); }
  abort(): Promise<void> { return this.session.abort(); }
  waitForIdle(): Promise<void> { return this.session.waitForIdle(); }
  compact(instructions?: string): Promise<void> { return this.session.compact(instructions).then(() => undefined); }

  getSessionFile(): string | undefined { return this.session.sessionManager.getSessionFile(); }
  getSessionHeader(): { id: string; timestamp: string; cwd: string } | null {
    const header = this.session.sessionManager.getHeader();
    return header ? { id: header.id, timestamp: header.timestamp, cwd: header.cwd } : null;
  }
  getSessionTree(): readonly unknown[] { return this.session.sessionManager.getTree(); }
  exportToJsonl(outputPath?: string): string { return this.session.exportToJsonl(outputPath); }
  exportToHtml(outputPath?: string): Promise<string> { return this.session.exportToHtml(outputPath); }
  fork(entryId?: string): string | undefined {
    const leafId = entryId ?? this.session.sessionManager.getLeafId();
    return leafId ? this.session.sessionManager.createBranchedSession(leafId) : undefined;
  }

  appendEntry<T = unknown>(customType: string, data?: T): void {
    this.session.sessionManager.appendCustomEntry(customType, data);
    const sessionFile = this.session.sessionManager.getSessionFile();
    if (sessionFile) this.session.exportToJsonl(sessionFile);
  }

  appendSessionInfo(name: string): void {
    this.session.sessionManager.appendSessionInfo(name);
    const sessionFile = this.session.sessionManager.getSessionFile();
    if (sessionFile) this.session.exportToJsonl(sessionFile);
  }

  getCustomEntries(customType?: string): readonly unknown[] {
    return this.session.sessionManager.getEntries().filter((entry) => {
      if (entry.type !== 'custom') return false;
      return customType === undefined || entry.customType === customType;
    });
  }

  getAvailableToolNames(): readonly string[] {
    return this.session.agent.state.tools.map((tool) => tool.name);
  }

  async executeTool(name: string, toolCallId: string, input: unknown, signal = new AbortController().signal) {
    const definition = this.session.getToolDefinition(name);
    if (!definition) throw new Error(`Pi tool not registered: ${name}`);
    return definition.execute(toolCallId, input, signal, undefined, {} as never);
  }

  getMessages(): readonly unknown[] {
    return this.session.agent.state.messages;
  }

  getResourceTrustAudit(): readonly PiResourceTrustAudit[] { return this.resourceTrustAudit; }
  getLoadedPackageResources(): readonly PiPackageResourceSnapshot[] { return this.packageResources; }
  getLoadedPackageContracts(): PiPackageContracts { return this.packageContracts; }
  evaluatePackage(name: string, value: unknown): PiEvalResult {
    const contract = this.packageContracts.evals.find((candidate) => candidate.name === name || candidate.path === name);
    if (!contract) throw new Error(`Pi package eval is not loaded: ${name}`);
    return evaluatePiPackage(contract, value);
  }

  subscribe(listener: (event: UpUpAgentEvent) => void): () => void {
    this.listeners.add(listener);
    listener({ type: 'session_start', sessionId: this.id, agentId: this.spec.id });
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.unsubscribe();
    this.listeners.clear();
    this.session.dispose();
  }
}

export class PiAgentSessionFactory implements UpUpAgentRuntime {
  async createSession(spec: UpUpAgentSpec, options: UpUpCreateSessionOptions = {}): Promise<UpUpAgentSession> {
    validateAgentSpec(spec);
    const cwd = options.cwd ?? process.cwd();
    const sourceTools: readonly UpUpToolContract[] = options.tools
      ? options.tools
      : options.loadRegisteredTools === false
        ? []
        : await import('./registry-adapter.js').then(({ loadRegisteredPiToolContracts }) => loadRegisteredPiToolContracts(spec.model ?? process.env.DEFAULT_MODEL ?? 'deepseek-v4-flash'));
    const tools = sourceTools.filter((tool) => spec.tools === '*' || spec.tools.includes(tool.name));
    const packageCatalog = new PiPackageCatalog();
    const builtinPackages = options.piPackagePaths === undefined ? getBuiltinPiPackageOptions(cwd) : undefined;
    const piPackagePaths = options.piPackagePaths ?? builtinPackages?.piPackagePaths;
    const piPackageTrust = options.piPackageTrust ?? builtinPackages?.piPackageTrust;
    if ((piPackagePaths?.length ?? 0) > 0) {
      if (!piPackageTrust) throw new Error('Pi package loading requires an explicit piPackageTrust policy');
      for (const packagePath of piPackagePaths ?? []) packageCatalog.register(packagePath, piPackageTrust, cwd);
    }
    const packageResources = packageCatalog.resources();
    const resourceTrust = options.pluginTrust ?? piPackageTrust;
    const trustedSkills = verifyPiResourceTrust([...packageResources.skills, ...(options.additionalSkillPaths ?? [])], resourceTrust, cwd);
    const trustedPrompts = verifyPiResourceTrust([...packageResources.prompts, ...(options.additionalPromptTemplatePaths ?? [])], resourceTrust, cwd);
    const trustedExtensions = verifyPiResourceTrust([...packageResources.extensions, ...(options.additionalExtensionPaths ?? [])], resourceTrust, cwd);
    const trustedDomainResources = verifyPiResourceTrust([
      ...packageResources.workflows,
      ...packageResources.policies,
      ...packageResources.evals,
    ], resourceTrust, cwd);
    const packageContracts = packageCatalog.contracts();
    const financePackageEnabled = packageCatalog.get('@upup/pi-finance-sdk')?.enabled === true;
    const pluginBindings = options.piPlugins ?? (options.pluginTrust ? getLoadedPiPluginBindings(spec, options.requestToolApproval) : []);
    const trustedPlugins = pluginBindings.map((binding) => {
      const audit = verifyPiResourceTrust([binding.path], options.pluginTrust, cwd);
      const filteredBinding = {
        ...binding,
        plugin: {
          ...binding.plugin,
          tools: binding.plugin.tools.filter((tool) => spec.tools === '*' || spec.tools.includes(tool.name)),
        },
        spec,
        requestToolApproval: options.requestToolApproval,
      };
      return { binding: filteredBinding, audit };
    }) ?? [];
    const sessionManager = options.sessionPath
      ? (await mkdir(dirname(options.sessionPath), { recursive: true }), SessionManager.open(options.sessionPath, undefined, cwd))
      : options.sessionDir || options.sessionId
        ? SessionManager.create(cwd, options.sessionDir, options.sessionId ? { id: options.sessionId } : undefined)
      : SessionManager.inMemory(cwd);
    const sessionFileBeforeInitialization = sessionManager.getSessionFile();
    const settingsManager = SettingsManager.inMemory();
    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir: cwd,
      settingsManager,
      extensionFactories: [
        createFinanceSessionExtension(),
        ...(financePackageEnabled ? [] : [createFinanceExtension(spec, tools, options.requestToolApproval)]),
        ...createPiPluginExtensions(trustedPlugins.map(({ binding }) => binding)),
      ],
      additionalExtensionPaths: trustedExtensions.paths.length ? [...trustedExtensions.paths] : undefined,
      additionalSkillPaths: trustedSkills.paths.length ? trustedSkills.paths : undefined,
      additionalPromptTemplatePaths: trustedPrompts.paths.length ? trustedPrompts.paths : undefined,
      noSkills: trustedSkills.paths.length === 0,
      noPromptTemplates: trustedPrompts.paths.length === 0,
      noThemes: true,
      noContextFiles: true,
      systemPrompt: spec.systemPrompt ?? PI_DEFAULT_SYSTEM_PROMPT,
      appendSystemPrompt: [
        `You are the ${spec.name} investment agent. ${spec.description}`,
        `Data policy: ${spec.dataPolicy ?? 'live'}. Output contract: ${spec.outputContract ?? 'report'}.`,
        `Capabilities: ${spec.capabilities.join(', ')}.`,
        ...packageContracts.workflows.map((workflow) => `Trusted Pi workflow ${workflow.name} (${workflow.packageName}@${workflow.packageVersion}) phases: ${workflow.phases.join(' → ')}.`),
        ...packageContracts.policies.map((policy) => `Trusted Pi policy ${policy.name} (${policy.packageName}@${policy.packageVersion}):\n${policy.rules.join('\n')}`),
      ],
    });
    if (financePackageEnabled) {
      await reloadFinancePackageResources(resourceLoader, spec, tools, options.requestToolApproval);
    } else {
      await resourceLoader.reload();
    }
    const result = await createAgentSession({
      cwd,
      sessionManager,
      settingsManager,
      resourceLoader,
      model: options.model ?? resolvePiModel(spec.model),
      modelRuntime: options.modelRuntime,
      noTools: 'builtin',
      thinkingLevel: spec.thinkingLevel === 'off' ? 'minimal' : spec.thinkingLevel,
    });
    const activeToolNames = result.session.getActiveToolNames();
    result.session.setActiveToolsByName(
      spec.tools === '*'
        ? activeToolNames
      : activeToolNames.filter((name) => spec.tools.includes(name)),
    );
    if (sessionFileBeforeInitialization && !existsSync(sessionFileBeforeInitialization)) {
      const sessionFile = result.session.sessionManager.getSessionFile();
      if (sessionFile) {
        result.session.exportToJsonl(sessionFile);
        result.session.sessionManager.setSessionFile(sessionFile);
      }
    }
    return new PiAgentSession(spec, result.session, [
      ...packageCatalog.listEnabled().flatMap((record) => record.audits),
      ...trustedSkills.audits,
      ...trustedPrompts.audits,
      ...trustedExtensions.audits,
      ...trustedDomainResources.audits,
      ...trustedPlugins.flatMap(({ audit }) => audit.audits),
    ], packageCatalog.readResources(), packageContracts);
  }
}

function resolvePiModel(modelName?: string) {
  const configured = modelName ?? process.env.DEFAULT_MODEL ?? 'deepseek-v4-flash';
  const explicitSeparator = configured.indexOf(':');
  const explicitProvider = explicitSeparator > 0 ? configured.slice(0, explicitSeparator) : undefined;
  const model = explicitProvider ? configured.slice(explicitSeparator + 1) : configured;
  const provider = explicitProvider ?? (model.startsWith('claude-')
    ? 'anthropic'
    : model.startsWith('gemini-')
      ? 'google'
      : model.startsWith('gpt-')
        ? 'openai'
        : model.startsWith('kimi-')
          ? 'moonshotai'
          : model.startsWith('grok-')
            ? 'xai'
            : model.includes('/')
              ? 'openrouter'
              : 'deepseek');
  const models = getModels(provider as never);
  return models.find((candidate) => candidate.id === model)
    ?? models.find((candidate) => candidate.id === model.replace(/^openrouter:/, ''))
    ?? getModel(provider as never, models[0]?.id as never);
}

export function createPiAgentRuntime(): UpUpAgentRuntime {
  return new PiAgentSessionFactory();
}
