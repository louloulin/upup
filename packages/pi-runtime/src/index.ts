import { randomUUID } from 'node:crypto';
import type { AgentToolResult } from '@earendil-works/pi-agent-core';
import type { ExtensionAPI, InlineExtension } from '@earendil-works/pi-coding-agent';
import type { ModelRuntime } from '@earendil-works/pi-coding-agent';
import type { Model } from '@earendil-works/pi-ai';
import { Type, type TSchema } from 'typebox';

export const PI_RUNTIME_CONTRACT = 'upup.pi.runtime.v1' as const;
export const PI_EVENTS_CONTRACT = 'upup.pi.events.v1' as const;
export const PI_CAPABILITIES_CONTRACT = 'upup.pi.capabilities.v1' as const;
export const PI_MARKET_DATA_CAPABILITIES_CONTRACT = 'upup.pi.market-data.v1' as const;
export const PI_MARKET_DATA_CAPABILITY_VERSION = '1.0.0' as const;

export type ApprovalDecision = 'allow-once' | 'allow-session' | 'deny';
export type StreamMode = 'requesting' | 'thinking' | 'responding' | 'tool-input' | 'tool-use';
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface ChannelProfile {
  readonly label: string;
  readonly preamble: string;
  readonly behavior: readonly string[];
  readonly responseFormat: readonly string[];
  readonly tables: string | null;
}

export const PI_MARKET_DATA_CAPABILITY_NAMES = {
  historyFetcher: 'market-data.history-fetcher',
  quoteFetcher: 'market-data.quote-fetcher',
  quoteTrendStore: 'market-data.quote-trend-store',
  evidence: 'financial.evidence',
  audit: 'financial.audit',
} as const;

export type UpUpAgentMode = 'primary' | 'subagent' | 'worker' | 'reviewer';
export type UpUpThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high';
export type UpUpDataPolicy = 'live' | 'delayed' | 'historical' | 'cached' | 'offline';
export type UpUpOutputContract = 'markdown' | 'json' | 'report' | 'evidence';
export type UpUpToolSafetyLevel = 'safe' | 'warning' | 'dangerous' | 'critical';
export type UpUpToolCategory = 'finance' | 'market' | 'research' | 'valuation' | 'portfolio' | 'risk' | 'trading' | 'filesystem' | 'network' | 'system';

export interface UpUpPermissionProfile {
  id: string;
  allow: readonly UpUpToolSafetyLevel[];
  requireApproval: readonly UpUpToolSafetyLevel[];
  deny: readonly UpUpToolSafetyLevel[];
  allowExternalNetwork: boolean;
  allowCredentialAccess: boolean;
  allowFinancialWrites: boolean;
}

export type UpUpToolPolicyDecision = 'allowed' | 'denied' | 'approval_required' | 'approval_granted' | 'approval_denied';

export type PiSideEffectKind = 'filesystem-write' | 'external-network' | 'credential-access' | 'financial-write';

export interface PiSideEffectPolicyAudit {
  readonly contract: 'upup.pi.side-effect-policy.v1';
  readonly auditId: string;
  readonly sessionId: string;
  readonly tool: string;
  readonly effect: PiSideEffectKind;
  readonly safetyLevel: UpUpToolSafetyLevel;
  readonly permissionProfile: string;
  readonly decision: 'denied' | 'approval_required' | 'approval_granted' | 'approval_denied';
  readonly reason: string;
  readonly recordedAt: string;
}

export interface PiSideEffectDeclaration {
  readonly tools: readonly string[];
  readonly effect: PiSideEffectKind;
  readonly safetyLevel: UpUpToolSafetyLevel;
}

export function classifyPiSideEffect(tool: string, declarations: readonly PiSideEffectDeclaration[]): PiSideEffectDeclaration | undefined {
  return declarations.find((declaration) => declaration.tools.includes(tool));
}

export function createPiSideEffectPolicyExtension(options: { spec: UpUpAgentSpec; sessionId: string; declarations: readonly PiSideEffectDeclaration[] }): InlineExtension {
  return {
    name: 'upup-pi-side-effect-policy',
    hidden: true,
    factory: (pi) => {
      pi.on('tool_call', async (event, context) => {
        const classification = classifyPiSideEffect(event.toolName, options.declarations);
        if (!classification) return undefined;
        const auditId = event.toolCallId;
        const record = (decision: PiSideEffectPolicyAudit['decision'], reason: string): PiSideEffectPolicyAudit => ({
          contract: 'upup.pi.side-effect-policy.v1',
          auditId,
          sessionId: options.sessionId,
          tool: event.toolName,
          effect: classification.effect,
          safetyLevel: classification.safetyLevel,
          permissionProfile: options.spec.permissions.id,
          decision,
          reason,
          recordedAt: new Date().toISOString(),
        });
        const append = (audit: PiSideEffectPolicyAudit) => {
          (context.sessionManager as unknown as { appendCustomEntry: (customType: string, data: unknown) => string }).appendCustomEntry('upup_pi_policy_audit', audit);
        };
        const denied = (reason: string) => {
          append(record('denied', reason));
          return { block: true, terminate: true, reason: `Pi side-effect policy denied ${event.toolName}: ${reason}` };
        };
        if (!canUseTool(options.spec.permissions, classification.safetyLevel)) {
          return denied(`safety level ${classification.safetyLevel} is not allowed by ${options.spec.permissions.id}`);
        }
        if (classification.effect === 'credential-access' && !options.spec.permissions.allowCredentialAccess) {
          return denied('credential access is disabled for this Agent Profile');
        }
        if (classification.effect === 'financial-write' && !options.spec.permissions.allowFinancialWrites) {
          return denied('financial writes are disabled; use an explicitly approved sandbox policy');
        }
        if (classification.effect === 'external-network' && !options.spec.permissions.allowExternalNetwork) {
          return denied('external network access is disabled for this Agent Profile');
        }
        if (!context.hasUI || !context.ui) {
          append(record('approval_required', 'side effects require interactive approval in the active Pi UI'));
          return { block: true, terminate: true, reason: `Pi side-effect policy requires interactive approval for ${event.toolName}` };
        }
        const approved = await context.ui.confirm(
          `Approve ${classification.effect}`,
          `Allow ${event.toolName} to perform a ${classification.effect} side effect?`,
          { signal: context.signal },
        );
        if (!approved) {
          append(record('approval_denied', 'interactive approval was denied'));
          return { block: true, terminate: true, reason: `Pi side-effect policy approval denied for ${event.toolName}` };
        }
        append(record('approval_granted', 'interactive approval granted by the active Pi UI'));
        return undefined;
      });
    },
  };
}

export interface UpUpToolPolicyAudit {
  auditId: string;
  tool: string;
  effect?: PiSideEffectKind;
  safetyLevel: UpUpToolSafetyLevel;
  permissionProfile: string;
  decision: UpUpToolPolicyDecision;
  reason: string;
  recordedAt: string;
}

export interface UpUpAgentSpec {
  id: string;
  version: string;
  name: string;
  description: string;
  systemPrompt?: string;
  promptFiles?: readonly string[];
  /**
   * Optional whitelist of skill names to expose to the model. When omitted,
   * every skill the resource loader surfaces (Pi packages + the user's
   * `~/.agents/skills` library) reaches the system prompt.
   */
  skills?: readonly string[];
  /**
   * Controls whether the user's `~/.agents/skills` (Pi's auto-discovery for
   * agent-skills) is exposed to the model. The Pi canonical behaviour loads
   * the full user skill library; UpUp keeps that as the default but lets a
   * profile opt out so each session does not silently pull in hundreds of
   * unrelated skills (and their token cost / accidental invocation risk).
   *
   * - `'include'` (default) — Pi canonical behaviour; full user library.
   * - `'exclude'`             — no user library; only skills from explicit
   *                             Pi package paths and `spec.skills` whitelist.
   * - `'whitelist-only'`      — same as `'exclude'`, but the resolved set is
   *                             additionally intersected with `spec.skills`.
   */
  userSkills?: 'include' | 'exclude' | 'whitelist-only';
  packages?: readonly string[];
  tools: readonly string[] | '*';
  model?: string;
  thinkingLevel?: UpUpThinkingLevel;
  mode: UpUpAgentMode;
  capabilities: readonly string[];
  taskTypes: readonly string[];
  permissions: UpUpPermissionProfile;
  workflow?: string;
  maxConcurrency?: number;
  timeoutMs?: number;
  dataPolicy?: UpUpDataPolicy;
  outputContract?: UpUpOutputContract;
}

export interface FinancialEvidenceRecord {
  id: string;
  source: string;
  url?: string;
  retrievedAt: string;
  asOf?: string;
  query: string;
  dataHash?: string;
  confidence?: 'high' | 'medium' | 'low';
}

export interface PiEvidenceCapabilityInput {
  readonly id: string;
  readonly source: string;
  readonly retrievedAt: string;
  readonly asOf: string;
  readonly query: string;
  readonly dataFreshness: UpUpDataPolicy;
  readonly auditId: string;
}

export type PiEvidenceCapability = (input: PiEvidenceCapabilityInput) => FinancialEvidenceRecord & {
  readonly dataFreshness: UpUpDataPolicy;
  readonly auditId: string;
};

export interface PiAuditCapabilityInput {
  readonly auditId: string;
  readonly tool: string;
  readonly query: string;
}

export type PiAuditCapability = (input: PiAuditCapabilityInput) => string;

export interface FinancialToolDetails {
  evidence: readonly FinancialEvidenceRecord[];
  dataFreshness: UpUpDataPolicy;
  warnings?: readonly string[];
  assumptions?: Readonly<Record<string, string | number | boolean>>;
  auditId: string;
}

export interface UpUpFinanceSessionContext {
  ticker?: string;
  market?: string;
  asOf?: string;
  assumptions: Readonly<Record<string, string | number | boolean>>;
  risks: readonly string[];
  evidence: readonly FinancialEvidenceRecord[];
  unfinishedPhases: readonly string[];
}

export interface UpUpToolUpdate { text: string; progress?: number }
export interface UpUpToolContext {
  signal?: AbortSignal;
  agent: UpUpAgentSpec;
  toolCallId: string;
  onUpdate?: (update: UpUpToolUpdate) => void;
  auditId: string;
}
export interface UpUpToolResult<TResult> { value: TResult; text: string; details?: FinancialToolDetails }
export interface UpUpToolContract<TInput = unknown, TResult = unknown> {
  name: string;
  label: string;
  description: string;
  compactDescription?: string;
  category: UpUpToolCategory;
  safetyLevel: UpUpToolSafetyLevel;
  parameters: TSchema;
  concurrencyKey?: string | ((input: TInput) => string | undefined);
  maxConcurrent?: number;
  hasFinancialImpact: boolean;
  execute(input: TInput, context: UpUpToolContext): Promise<UpUpToolResult<TResult>>;
}
export interface PiToolDefinition<TInput = unknown, TResult = unknown> {
  name: string;
  label: string;
  description: string;
  safetyLevel: UpUpToolSafetyLevel;
  parameters: TSchema;
  execute(input: TInput, context: UpUpToolContext): Promise<UpUpToolResult<TResult>>;
}

export type UpUpAgentEvent =
  | { type: 'session_start'; sessionId: string; agentId: string }
  | { type: 'agent_start'; sessionId: string }
  | { type: 'turn_start'; sessionId: string }
  | { type: 'text_delta'; sessionId: string; delta: string }
  | { type: 'tool_start'; sessionId: string; toolName: string; toolCallId: string; input: unknown }
  | { type: 'tool_update'; sessionId: string; toolName: string; text: string; progress?: number }
  | { type: 'tool_end'; sessionId: string; toolName: string; toolCallId: string; error?: string }
  | { type: 'message_end'; sessionId: string; role: string; text: string; stopReason?: string }
  | { type: 'thinking'; sessionId: string; text: string }
  | { type: 'compaction_start'; sessionId: string; reason: string }
  | { type: 'compaction_end'; sessionId: string; success: boolean; error?: string }
  | { type: 'turn_end'; sessionId: string }
  | { type: 'agent_end'; sessionId: string }
  | {
      type: 'run_end';
      sessionId: string;
      answer: string;
      iterations: number;
      totalTime: number;
      tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number };
    }
  | { type: 'session_error'; sessionId: string; error: string };

export interface UpUpAgentSession {
  readonly id: string;
  readonly spec: UpUpAgentSpec;
  prompt(input: string, options?: { signal?: AbortSignal }): Promise<void>;
  steer(input: string): Promise<void>;
  followUp(input: string): Promise<void>;
  abort(): Promise<void>;
  waitForIdle(): Promise<void>;
  compact(instructions?: string): Promise<void>;
  getSessionFile(): string | undefined;
  getSessionHeader(): { id: string; timestamp: string; cwd: string } | null;
  getSessionTree(): readonly unknown[];
  exportToJsonl(outputPath?: string): string;
  exportToHtml(outputPath?: string): Promise<string>;
  fork(entryId?: string): string | undefined;
  appendEntry<T = unknown>(customType: string, data?: T): void;
  appendSessionInfo(name: string): void;
  setFinanceContext(context: Partial<UpUpFinanceSessionContext>): void;
  getFinanceContext(): UpUpFinanceSessionContext;
  getCustomEntries(customType?: string): readonly unknown[];
  getAvailableToolNames(): readonly string[];
  executeTool(name: string, toolCallId: string, input: unknown, signal?: AbortSignal): Promise<AgentToolResult<unknown>>;
  getMessages(): readonly unknown[];
  getResourceTrustAudit(): readonly PiResourceTrustAudit[];
  getLoadedPackageResources(): readonly PiPackageResourceSnapshot[];
  getLoadedPackageContracts(): PiPackageContracts;
  evaluatePackage(name: string, value: unknown): PiEvalResult;
  subscribe(listener: (event: UpUpAgentEvent) => void): () => void;
  dispose(): void;
}

export interface PiPackageTrustPolicy {
  trustedPaths: readonly string[];
  allowedHashes?: Readonly<Record<string, string>>;
  pinnedPackages?: Readonly<Record<string, string>>;
  allowedSources?: Readonly<Record<string, readonly string[]>>;
}
export interface PiResourceTrustAudit {
  path: string;
  contentHash: string;
  packageName?: string;
  packageVersion?: string;
  packageSource?: string;
  decision: 'trusted';
}
export interface PiPackageResourceSnapshot {
  path: string;
  content: string;
  packageName: string;
  packageVersion: string;
  kind: 'extension' | 'skill' | 'prompt' | 'workflow' | 'policy' | 'eval';
}
export interface PiEvalResult {
  contract: string;
  passed: boolean;
  cases: readonly { id: string; passed: boolean; missing: readonly string[]; forbidden: readonly string[] }[];
}
export interface UpUpCreateSessionOptions {
  cwd?: string;
  sessionPath?: string;
  sessionDir?: string;
  sessionId?: string;
  tools?: readonly UpUpToolContract[];
  signal?: AbortSignal;
  model?: Model<any>;
  modelRuntime?: ModelRuntime;
  requestToolApproval?: (request: { tool: string; input: unknown; safetyLevel: UpUpToolSafetyLevel; auditId: string; permissionProfile: string }) => boolean | Promise<boolean>;
  additionalSkillPaths?: readonly string[];
  additionalPromptTemplatePaths?: readonly string[];
  additionalExtensionPaths?: readonly string[];
  piPackagePaths?: readonly string[];
  piPackageTrust?: PiPackageTrustPolicy;
  marketHistoryFetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  marketHistoryFetchers?: Readonly<Record<string, (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>>;
  marketHistoryProviders?: Readonly<Record<string, 'auto' | 'yahoo' | 'tushare' | 'financial-datasets'>>;
  marketHistoryApiKeys?: Readonly<Record<string, string>>;
  marketHistoryBaseUrls?: Readonly<Record<string, string>>;
  marketQuoteFetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  researchDataFetcher?: typeof fetch;
  researchDataFetchers?: Readonly<Record<string, typeof fetch>>;
  researchDataProviders?: Readonly<Record<string, string>>;
  researchDataApiKeys?: Readonly<Record<string, string>>;
  researchDataBaseUrls?: Readonly<Record<string, string>>;
  marketQuoteTrendStore?: any;
}
export interface UpUpAgentRuntime { createSession(spec: UpUpAgentSpec, options?: UpUpCreateSessionOptions): Promise<UpUpAgentSession> }

const SAFETY_LEVELS: readonly UpUpToolSafetyLevel[] = ['safe', 'warning', 'dangerous', 'critical'];
export function validateAgentSpec(spec: UpUpAgentSpec): void {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(spec.id)) throw new Error(`Invalid agent id: ${spec.id}`);
  if (!/^\d+\.\d+\.\d+$/.test(spec.version)) throw new Error(`Invalid agent version: ${spec.version}`);
  if (!spec.name.trim() || !spec.description.trim()) throw new Error(`Agent ${spec.id} requires name and description`);
  if (spec.packages?.some((name) => !/^(@[a-z0-9-]+\/)?[a-z0-9][a-z0-9._-]*$/.test(name))) throw new Error(`Agent ${spec.id} contains an invalid Pi package name`);
  if (spec.packages && new Set(spec.packages).size !== spec.packages.length) throw new Error(`Agent ${spec.id} contains duplicate Pi package names`);
  if (spec.tools !== '*' && spec.tools.length === 0) throw new Error(`Agent ${spec.id} must declare tools or *`);
  if (spec.permissions.deny.some((level) => !SAFETY_LEVELS.includes(level))) throw new Error(`Agent ${spec.id} contains an unknown denied safety level`);
  if (spec.permissions.allowFinancialWrites && spec.permissions.deny.includes('dangerous')) throw new Error(`Agent ${spec.id} cannot allow financial writes while denying dangerous tools`);
  if (spec.maxConcurrency !== undefined && (!Number.isInteger(spec.maxConcurrency) || spec.maxConcurrency < 1)) throw new Error(`Agent ${spec.id} has invalid maxConcurrency`);
  if (spec.timeoutMs !== undefined && (!Number.isInteger(spec.timeoutMs) || spec.timeoutMs < 1)) throw new Error(`Agent ${spec.id} has invalid timeoutMs`);
}
export function serializeAgentSpec(spec: UpUpAgentSpec): string { validateAgentSpec(spec); return JSON.stringify(spec, null, 2); }
export function canUseTool(profile: UpUpPermissionProfile, safetyLevel: UpUpToolSafetyLevel): boolean { return !profile.deny.includes(safetyLevel) && profile.allow.includes(safetyLevel); }
export function requiresApproval(profile: UpUpPermissionProfile, safetyLevel: UpUpToolSafetyLevel): boolean { return profile.requireApproval.includes(safetyLevel); }
export function createToolContext(agent: UpUpAgentSpec, toolCallId: string, signal?: AbortSignal, onUpdate?: UpUpToolContext['onUpdate']): UpUpToolContext { return { agent, toolCallId, signal, onUpdate, auditId: randomUUID() }; }
export function withFinancialDetails<TResult>(result: UpUpToolResult<TResult>, details: FinancialToolDetails): UpUpToolResult<TResult> { return { ...result, details }; }
export function toPiToolDefinition<TInput, TResult>(tool: UpUpToolContract<TInput, TResult>): PiToolDefinition<TInput, TResult> { return { name: tool.name, label: tool.label, description: tool.description, safetyLevel: tool.safetyLevel, parameters: tool.parameters, execute: tool.execute }; }
export function defaultToolParameters(): TSchema { return Type.Object({}); }

export type CanonicalAgentEvent = UpUpAgentEvent & { contract: typeof PI_EVENTS_CONTRACT };
export function toCanonicalAgentEvent(event: UpUpAgentEvent): CanonicalAgentEvent { return { ...event, contract: PI_EVENTS_CONTRACT }; }

export type PiCapabilityScope = 'runtime' | 'session' | 'process';
export type PiCapabilityTrustMode = 'builtin' | 'trusted' | 'sandboxed';
export interface PiCapabilityTrustContract {
  readonly mode: PiCapabilityTrustMode;
  readonly network?: boolean;
  readonly credentials?: boolean;
  readonly filesystem?: boolean;
}
export interface PiCapabilityLifecycleContract {
  readonly scope: PiCapabilityScope;
  readonly initialize?: string;
  readonly reload?: string;
  readonly dispose?: string;
}
export interface PiCapabilityDescriptor {
  readonly name: string;
  readonly version: string;
  readonly scope: PiCapabilityScope;
  readonly trust: PiCapabilityTrustContract;
  readonly lifecycle: PiCapabilityLifecycleContract;
}
export interface PiCapability<T = unknown> {
  readonly version: string;
  readonly value: T;
  readonly descriptor?: PiCapabilityDescriptor;
  readonly dispose?: () => void | Promise<void>;
}

const capability = (name: string, scope: PiCapabilityScope, trust: PiCapabilityTrustContract, lifecycle: PiCapabilityLifecycleContract = { scope }): PiCapabilityDescriptor => ({ name, version: '1.0.0', scope, trust, lifecycle });

export const PI_CAPABILITY_CATALOG: readonly PiCapabilityDescriptor[] = Object.freeze([
  capability('market-data.history-fetcher', 'session', { mode: 'trusted', network: true, credentials: true }),
  capability('market-data.quote-fetcher', 'session', { mode: 'trusted', network: true, credentials: true }),
  capability('market-data.quote-trend-store', 'session', { mode: 'builtin', filesystem: true }),
  capability('financial.evidence', 'session', { mode: 'builtin' }),
  capability('financial.audit', 'session', { mode: 'builtin', filesystem: true }),
  capability('memory.session', 'session', { mode: 'builtin', filesystem: true }),
  capability('permissions.policy', 'session', { mode: 'builtin' }),
  capability('storage.session', 'session', { mode: 'builtin', filesystem: true }),
  capability('planning.workflow', 'session', { mode: 'builtin' }),
  capability('subagent.worker', 'session', { mode: 'sandboxed' }),
  capability('mcp.client', 'session', { mode: 'sandboxed', network: true }),
  capability('sandbox.filesystem', 'session', { mode: 'sandboxed', filesystem: true }),
  capability('observability.telemetry', 'session', { mode: 'builtin', filesystem: true }),
]);

export function validatePiCapabilityDescriptor(descriptor: PiCapabilityDescriptor): void {
  if (!descriptor.name.trim()) throw new Error('Pi capability name is missing');
  if (!/^\d+\.\d+\.\d+$/.test(descriptor.version)) throw new Error(`Pi capability version is invalid: ${descriptor.name}`);
  if (descriptor.trust.mode === 'sandboxed' && descriptor.trust.credentials) throw new Error(`Sandboxed Pi capability cannot access credentials: ${descriptor.name}`);
  if (descriptor.lifecycle.scope !== descriptor.scope) throw new Error(`Pi capability lifecycle scope mismatch: ${descriptor.name}`);
  if (descriptor.lifecycle.reload && !descriptor.lifecycle.initialize) throw new Error(`Pi capability reload requires initialize: ${descriptor.name}`);
  for (const [name, entry] of Object.entries(descriptor.lifecycle)) {
    if (name === 'scope' || entry === undefined) continue;
    if (typeof entry !== 'string' || !/^\.\/[A-Za-z0-9_./-]+#[A-Za-z0-9_$.-]+$/.test(entry)) throw new Error(`Pi capability lifecycle ${name} must use ./module#export syntax: ${descriptor.name}`);
  }
}

export function validatePiCapabilityCatalog(catalog: readonly PiCapabilityDescriptor[]): void {
  const names = new Set<string>();
  for (const descriptor of catalog) {
    validatePiCapabilityDescriptor(descriptor);
    if (names.has(descriptor.name)) throw new Error(`Pi capability catalog contains duplicates: ${descriptor.name}`);
    names.add(descriptor.name);
  }
}

validatePiCapabilityCatalog(PI_CAPABILITY_CATALOG);

export interface PiCapabilityContext {
  readonly contract: typeof PI_CAPABILITIES_CONTRACT;
  readonly sessionId: string;
  readonly signal?: AbortSignal;
  readonly audit: Readonly<Record<string, string>>;
  get<T>(name: string, expectedVersion?: string): T;
  has(name: string, expectedVersion?: string): boolean;
  describe(name: string): PiCapabilityDescriptor | undefined;
  catalog(): readonly PiCapabilityDescriptor[];
  dispose(): Promise<void>;
}

export interface PiPromptPortOptions {
  readonly model?: string;
  readonly systemPrompt?: string;
  readonly signal?: AbortSignal;
  readonly sessionKey?: string;
  readonly toolFilter?: readonly string[] | '*';
}

export interface PiPromptPort {
  runPrompt(prompt: string, options?: PiPromptPortOptions): Promise<string>;
}
export function createPiCapabilityContext(input: { sessionId: string; signal?: AbortSignal; audit?: Readonly<Record<string, string>>; capabilities?: Readonly<Record<string, PiCapability>>; catalog?: readonly PiCapabilityDescriptor[] }): PiCapabilityContext {
  const values = new Map(Object.entries(input.capabilities ?? {}));
  const descriptors = new Map((input.catalog ?? PI_CAPABILITY_CATALOG).map((descriptor) => [descriptor.name, descriptor] as const));
  validatePiCapabilityCatalog([...descriptors.values()]);
  let disposed = false;
  return {
    contract: PI_CAPABILITIES_CONTRACT,
    sessionId: input.sessionId,
    signal: input.signal ?? new AbortController().signal,
    audit: input.audit ?? {},
    get<T>(name: string, expectedVersion?: string) {
      if (disposed) throw new Error(`Pi capability context is disposed: ${name}`);
      const capability = values.get(name);
      if (!capability) throw new Error(`Pi capability is unavailable: ${name}`);
      if (expectedVersion !== undefined && capability.version !== expectedVersion) throw new Error(`Pi capability version mismatch: ${name}@${capability.version}, expected ${expectedVersion}`);
      return capability.value as T;
    },
    has(name: string, expectedVersion?: string) {
      if (disposed) return false;
      const capability = values.get(name);
      return Boolean(capability && (expectedVersion === undefined || capability.version === expectedVersion));
    },
    describe(name: string) {
      if (disposed) return undefined;
      return descriptors.get(name);
    },
    catalog() {
      return disposed ? [] : [...descriptors.values()];
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      for (const capability of values.values()) await capability.dispose?.();
      values.clear();
      descriptors.clear();
    },
  };
}

export type PiPackageScope = 'runtime' | 'session' | 'process';
export type PiPackageTrustMode = 'builtin' | 'trusted' | 'sandboxed';

export interface PiPackageResourceContract {
  readonly extensions: readonly string[];
  readonly skills: readonly string[];
  readonly prompts: readonly string[];
  readonly workflows: readonly string[];
  readonly policies: readonly string[];
  readonly evals: readonly string[];
  readonly resources?: readonly string[];
}

export interface PiPackageCapabilityRequirement {
  readonly name: string;
  readonly version: string;
  readonly optional?: boolean;
  readonly scope?: PiCapabilityScope;
  readonly trust?: PiCapabilityTrustContract;
  readonly lifecycle?: PiCapabilityLifecycleContract;
}

export interface PiPackageTrustContract {
  readonly mode: PiPackageTrustMode;
  readonly network?: boolean;
  readonly credentials?: boolean;
  readonly filesystem?: boolean;
}

export interface PiPackageLifecycleContract {
  readonly scope: PiPackageScope;
  readonly initialize?: string;
  readonly reload?: string;
  readonly dispose?: string;
}

export interface PiPackageManifestContract {
  readonly name: string;
  readonly version: string;
  readonly contract?: string;
  readonly source: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly extension?: string;
  readonly hostCapabilities?: readonly string[];
  readonly tools?: readonly string[];
  readonly nativeTools?: readonly string[];
  readonly sideEffects?: readonly PiSideEffectDeclaration[];
  readonly capabilities?: readonly PiPackageCapabilityRequirement[];
  readonly trust?: PiPackageTrustContract;
  readonly lifecycle?: PiPackageLifecycleContract;
  readonly resources: PiPackageResourceContract;
}
export interface PiWorkflowContract { packageName: string; packageVersion: string; path: string; name: string; phases: readonly string[]; instructions: string }
export interface PiPolicyContract { packageName: string; packageVersion: string; path: string; name: string; rules: readonly string[]; text: string }
export interface PiEvalCase { id: string; requires?: readonly string[]; forbidden?: readonly string[] }
export interface PiEvalContract { packageName: string; packageVersion: string; path: string; name: string; version: string; cases: readonly PiEvalCase[] }
export interface PiPackageContracts { workflows: readonly PiWorkflowContract[]; policies: readonly PiPolicyContract[]; evals: readonly PiEvalContract[] }
export function validatePiPackageManifest(manifest: PiPackageManifestContract): void {
  if (!/^@[a-z0-9-]+\/[a-z0-9][a-z0-9._-]*$/.test(manifest.name)) throw new Error(`Invalid Pi package name: ${manifest.name}`);
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error(`Invalid Pi package version: ${manifest.version}`);
  if (manifest.contract !== undefined && manifest.contract !== PI_RUNTIME_CONTRACT) throw new Error(`Unsupported Pi package contract: ${manifest.contract}`);
  if (!manifest.source.trim()) throw new Error(`Pi package source is missing: ${manifest.name}`);
  if (manifest.hostCapabilities !== undefined) {
    if (manifest.hostCapabilities.some((capability) => typeof capability !== 'string' || !capability.trim())) throw new Error(`Pi package host capabilities are invalid: ${manifest.name}`);
    if (new Set(manifest.hostCapabilities).size !== manifest.hostCapabilities.length) throw new Error(`Pi package host capabilities contain duplicates: ${manifest.name}`);
  }
  for (const [field, tools] of [['tools', manifest.tools], ['nativeTools', manifest.nativeTools]] as const) {
    if (tools === undefined) continue;
    if (tools.some((tool) => typeof tool !== 'string' || !tool.trim())) throw new Error(`Pi package ${field} are invalid: ${manifest.name}`);
    if (new Set(tools).size !== tools.length) throw new Error(`Pi package ${field} contain duplicates: ${manifest.name}`);
  }
  if (manifest.nativeTools?.some((tool) => !manifest.tools?.includes(tool))) throw new Error(`Pi package nativeTools must be a subset of tools: ${manifest.name}`);
  const sideEffectTools = new Set<string>();
  for (const declaration of manifest.sideEffects ?? []) {
    if (declaration.tools.length === 0 || declaration.tools.some((tool) => !tool.trim())) throw new Error(`Pi package sideEffects tools are invalid: ${manifest.name}`);
    if (declaration.tools.some((tool) => !manifest.tools?.includes(tool))) throw new Error(`Pi package sideEffects tools must be declared in tools: ${manifest.name}`);
    for (const tool of declaration.tools) {
      if (sideEffectTools.has(tool)) throw new Error(`Pi package sideEffects contain duplicate tools: ${tool}`);
      sideEffectTools.add(tool);
    }
    if (!['filesystem-write', 'external-network', 'credential-access', 'financial-write'].includes(declaration.effect)) throw new Error(`Pi package sideEffects effect is invalid: ${manifest.name}`);
    if (!['safe', 'warning', 'dangerous', 'critical'].includes(declaration.safetyLevel)) throw new Error(`Pi package sideEffects safety level is invalid: ${manifest.name}`);
  }
  const all = Object.values(manifest.resources).flat();
  if (new Set(all).size !== all.length) throw new Error(`Pi package resources contain duplicates: ${manifest.name}`);
  for (const [name, version] of Object.entries(manifest.dependencies ?? {})) if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`Pi package dependency ${name} must use an exact semver`);
  for (const capability of manifest.capabilities ?? []) {
    if (!capability.name.trim()) throw new Error(`Pi package capability name is missing: ${manifest.name}`);
    if (!/^\d+\.\d+\.\d+$/.test(capability.version)) throw new Error(`Pi package capability ${capability.name} must use an exact semver`);
    if (capability.scope !== undefined && !['runtime', 'session', 'process'].includes(capability.scope)) throw new Error(`Pi package capability scope is invalid: ${capability.name}`);
    if (capability.trust !== undefined) {
      if (!['builtin', 'trusted', 'sandboxed'].includes(capability.trust.mode)) throw new Error(`Pi package capability trust mode is invalid: ${capability.name}`);
      if (capability.trust.mode === 'sandboxed' && capability.trust.credentials) throw new Error(`Sandboxed Pi package capability cannot access credentials: ${capability.name}`);
    }
    if (capability.lifecycle !== undefined) {
      validatePiCapabilityDescriptor({ name: capability.name, version: capability.version, scope: capability.scope ?? capability.lifecycle.scope, trust: capability.trust ?? { mode: 'builtin' }, lifecycle: capability.lifecycle });
    }
  }
  if (new Set((manifest.capabilities ?? []).map((capability) => capability.name)).size !== (manifest.capabilities ?? []).length) {
    throw new Error(`Pi package capabilities contain duplicates: ${manifest.name}`);
  }
  if (manifest.trust?.mode === 'sandboxed' && manifest.trust.credentials) throw new Error(`Sandboxed Pi package cannot access credentials: ${manifest.name}`);
  if (manifest.lifecycle?.scope === 'process' && manifest.lifecycle.dispose === undefined) throw new Error(`Process-scoped Pi package requires dispose lifecycle: ${manifest.name}`);
  for (const [name, entry] of Object.entries(manifest.lifecycle ?? {})) {
    if (name === 'scope' || entry === undefined) continue;
    if (typeof entry !== 'string' || !/^\.\/[A-Za-z0-9_./-]+#[A-Za-z0-9_$.-]+$/.test(entry)) {
      throw new Error(`Pi package lifecycle ${name} must use ./module#export syntax: ${manifest.name}`);
    }
  }
}
export interface PiSessionFactory { createSession(spec: UpUpAgentSpec, options?: UpUpCreateSessionOptions): Promise<UpUpAgentSession> }

/**
 * Runtime prompt builders contract.
 *
 * The Pi session factory does not import concrete prompt implementations;
 * it consumes these three builders through the composition provider so
 * `@upup/pi-prompt-config` (or any replacement) can be injected by the
 * application boundary. The contract is intentionally narrow: only the
 * default system prompt, the capabilities section, and the optional
 * coach system prompt are exposed.
 *
 * Implementations MUST be pure functions of their inputs; the factory
 * does not perform any additional escaping or formatting before
 * concatenating these strings into the final Pi system prompt.
 */
export interface PiPromptBuilders {
  readonly buildDefaultInvestmentSystemPrompt: () => string;
  readonly buildInvestmentCapabilitiesSection: (availableToolNames: readonly string[]) => string;
  readonly buildCoachSystemPrompt: () => string;
}


// ---------------------------------------------------------------------------
// Finance session context helpers.
//
// `UpUpFinanceSessionContext` is the per-session structured state carried
// through Pi Session entries (custom entry type `upup_finance_context`) and
// re-serialized during compaction. The shape, merge rules, and serialization
// format live here so they can be reused by anyone who needs to build a
// Pi session that carries investment context (e.g. the `/invest` workflow,
// the bridge session-sync transport, and any future evaluation harness).
//
// Before this contract was lifted out, the helpers were inlined inside
// the former root AgentSession factory and depended on private
// identifiers from the runtime composition root.
// ---------------------------------------------------------------------------

export const FINANCE_CONTEXT_ENTRY_TYPE = 'upup_finance_context' as const;
export const FINANCE_CONTEXT_SCHEMA_VERSION = 1 as const;

export function emptyFinanceSessionContext(): UpUpFinanceSessionContext {
  return { assumptions: {}, risks: [], evidence: [], unfinishedPhases: [] };
}

export function mergeFinanceSessionContext(
  current: UpUpFinanceSessionContext,
  update: Partial<UpUpFinanceSessionContext>,
): UpUpFinanceSessionContext {
  return {
    ...current,
    ...(update.ticker !== undefined ? { ticker: update.ticker } : {}),
    ...(update.market !== undefined ? { market: update.market } : {}),
    ...(update.asOf !== undefined ? { asOf: update.asOf } : {}),
    ...(update.assumptions ? { assumptions: { ...current.assumptions, ...update.assumptions } } : {}),
    ...(update.risks ? { risks: [...new Set(update.risks)] } : {}),
    ...(update.evidence ? { evidence: [...update.evidence] } : {}),
    ...(update.unfinishedPhases ? { unfinishedPhases: [...new Set(update.unfinishedPhases)] } : {}),
  };
}

export interface SerializedFinanceContext {
  schema: typeof FINANCE_CONTEXT_SCHEMA_VERSION;
  domain: 'finance';
  ticker: string | null;
  market: string | null;
  asOf: string | null;
  assumptions: Readonly<Record<string, string | number | boolean>>;
  risks: readonly string[];
  evidence: readonly FinancialEvidenceRecord[];
  unfinishedPhases: readonly string[];
  compactionReason: string;
  customInstructions: string | null;
}

export function serializeFinanceSessionContext(
  context: UpUpFinanceSessionContext,
  reason: string,
  instructions?: string,
): string {
  const payload: SerializedFinanceContext = {
    schema: FINANCE_CONTEXT_SCHEMA_VERSION,
    domain: 'finance',
    ticker: context.ticker ?? null,
    market: context.market ?? null,
    asOf: context.asOf ?? null,
    assumptions: context.assumptions,
    risks: context.risks,
    evidence: context.evidence,
    unfinishedPhases: context.unfinishedPhases,
    compactionReason: reason,
    customInstructions: instructions ?? null,
  };
  return JSON.stringify(payload);
}


// ---------------------------------------------------------------------------
// Finance session extension.
//
// `createFinanceSessionExtension` builds the Pi InlineExtension that
// serializes the current `UpUpFinanceSessionContext` into the
// `session_before_compact` payload so the finance context survives Pi
// Session compaction. Before this contract was lifted out, the same
// logic lived inline in `agent-session-factory.ts` and depended on a
// local mutable `current` reference. Centralizing it in the runtime
// package lets any downstream tool or eval harness reproduce the
// same compaction payload without re-implementing the policy.
// ---------------------------------------------------------------------------

export interface FinanceSessionExtensionContext {
  /** Mutable ref into the live `UpUpFinanceSessionContext`. */
  readonly current: UpUpFinanceSessionContext;
}

export function createFinanceSessionExtension(context: FinanceSessionExtensionContext): InlineExtension {
  return {
    name: 'upup-finance-session-policy',
    hidden: true,
    factory: (pi: ExtensionAPI) => {
      pi.on('session_before_compact', async (event) => ({
        compaction: {
          summary: serializeFinanceSessionContext(context.current, event.reason, event.customInstructions),
          firstKeptEntryId: event.preparation.firstKeptEntryId,
          tokensBefore: event.preparation.tokensBefore,
          details: { domain: 'investment', schema: 1 },
        },
      }));
    },
  };
}

export * from './citation';

export {
  PI_TOOL_ERROR_MARKER,
  wrapPiExtensionToolResults,
  createPiToolErrorBridgeExtension,
  type PiToolResult,
  type PiToolResultDetails,
} from './tool-result';

export {
  createUpUpBrandExtension,
  rebrandSystemPrompt,
  UPUP_IDENTITY_SENTENCE,
} from './brand-extension';
export * from './embedding-provider';

export {
  setSessionProviders,
  getSessionProviders,
  clearSessionProviders,
  listSessionProvidersKeys,
  __resetSessionProvidersForTests,
  type SetSessionProvidersOptions,
} from './session-providers-store';

export {
  bootstrapSessionProvidersAccessor,
} from './session-providers-bootstrap';
