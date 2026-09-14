import { randomUUID } from 'node:crypto';
import type { AgentToolResult } from '@earendil-works/pi-agent-core';
import type { ModelRuntime } from '@earendil-works/pi-coding-agent';
import type { Model } from '@earendil-works/pi-ai';
import { Type, type TSchema } from 'typebox';

export const PI_RUNTIME_CONTRACT = 'upup.pi.runtime.v1' as const;
export const PI_EVENTS_CONTRACT = 'upup.pi.events.v1' as const;
export const PI_CAPABILITIES_CONTRACT = 'upup.pi.capabilities.v1' as const;

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

export interface UpUpToolPolicyAudit {
  auditId: string;
  tool: string;
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
  skills?: readonly string[];
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
  signal: AbortSignal;
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
  subscribe(listener: (event: UpUpAgentEvent) => void): () => void;
  dispose(): void;
}

export interface PiPluginTrustPolicy {
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
  piPackageTrust?: PiPluginTrustPolicy;
  pluginTrust?: PiPluginTrustPolicy;
  piPlugins?: readonly any[];
  marketHistoryFetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  marketQuoteFetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
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
export function createToolContext(agent: UpUpAgentSpec, toolCallId: string, signal: AbortSignal, onUpdate?: UpUpToolContext['onUpdate']): UpUpToolContext { return { agent, toolCallId, signal, onUpdate, auditId: randomUUID() }; }
export function withFinancialDetails<TResult>(result: UpUpToolResult<TResult>, details: FinancialToolDetails): UpUpToolResult<TResult> { return { ...result, details }; }
export function toPiToolDefinition<TInput, TResult>(tool: UpUpToolContract<TInput, TResult>): PiToolDefinition<TInput, TResult> { return { name: tool.name, label: tool.label, description: tool.description, safetyLevel: tool.safetyLevel, parameters: tool.parameters, execute: tool.execute }; }
export function defaultToolParameters(): TSchema { return Type.Object({}); }

export type CanonicalAgentEvent = UpUpAgentEvent & { contract: typeof PI_EVENTS_CONTRACT };
export function toCanonicalAgentEvent(event: UpUpAgentEvent): CanonicalAgentEvent { return { ...event, contract: PI_EVENTS_CONTRACT }; }

export interface PiCapability<T = unknown> { readonly version: string; readonly value: T; readonly dispose?: () => void | Promise<void> }
export interface PiCapabilityContext {
  readonly contract: typeof PI_CAPABILITIES_CONTRACT;
  readonly sessionId: string;
  readonly signal: AbortSignal;
  readonly audit: Readonly<Record<string, string>>;
  get<T>(name: string, expectedVersion?: string): T;
  has(name: string, expectedVersion?: string): boolean;
  dispose(): Promise<void>;
}
export function createPiCapabilityContext(input: { sessionId: string; signal?: AbortSignal; audit?: Readonly<Record<string, string>>; capabilities?: Readonly<Record<string, PiCapability>> }): PiCapabilityContext {
  const values = new Map(Object.entries(input.capabilities ?? {}));
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
    async dispose() {
      if (disposed) return;
      disposed = true;
      for (const capability of values.values()) await capability.dispose?.();
      values.clear();
    },
  };
}

export interface PiPackageResourceContract { readonly extensions: readonly string[]; readonly skills: readonly string[]; readonly prompts: readonly string[]; readonly workflows: readonly string[]; readonly policies: readonly string[]; readonly evals: readonly string[] }
export interface PiPackageManifestContract { readonly name: string; readonly version: string; readonly source: string; readonly dependencies?: Readonly<Record<string, string>>; readonly resources: PiPackageResourceContract }
export interface PiWorkflowContract { packageName: string; packageVersion: string; path: string; name: string; phases: readonly string[]; instructions: string }
export interface PiPolicyContract { packageName: string; packageVersion: string; path: string; name: string; rules: readonly string[]; text: string }
export interface PiEvalCase { id: string; requires?: readonly string[]; forbidden?: readonly string[] }
export interface PiEvalContract { packageName: string; packageVersion: string; path: string; name: string; version: string; cases: readonly PiEvalCase[] }
export interface PiPackageContracts { workflows: readonly PiWorkflowContract[]; policies: readonly PiPolicyContract[]; evals: readonly PiEvalContract[] }
export function validatePiPackageManifest(manifest: PiPackageManifestContract): void {
  if (!/^@[a-z0-9-]+\/[a-z0-9][a-z0-9._-]*$/.test(manifest.name)) throw new Error(`Invalid Pi package name: ${manifest.name}`);
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error(`Invalid Pi package version: ${manifest.version}`);
  if (!manifest.source.trim()) throw new Error(`Pi package source is missing: ${manifest.name}`);
  const all = Object.values(manifest.resources).flat();
  if (new Set(all).size !== all.length) throw new Error(`Pi package resources contain duplicates: ${manifest.name}`);
  for (const [name, version] of Object.entries(manifest.dependencies ?? {})) if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Pi package dependency ${name} must use an exact semver`);
}
export interface PiSessionFactory { createSession(spec: UpUpAgentSpec, options?: UpUpCreateSessionOptions): Promise<UpUpAgentSession> }
