import type { AgentToolResult } from '@earendil-works/pi-agent-core';
import type { ModelRuntime } from '@earendil-works/pi-coding-agent';
import type { Model } from '@earendil-works/pi-ai';
import type { TSchema } from 'typebox';
import type { PiPluginTrustPolicy, PiResourceTrustAudit } from './plugin-trust.js';
import type { PiEvalResult, PiPackageContracts } from './package-contracts.js';
import type { PiPackageResourceSnapshot } from './package-catalog.js';
import type { PiPluginBinding } from './plugin-adapter.js';

export type UpUpAgentMode = 'primary' | 'subagent' | 'worker' | 'reviewer';

export type UpUpThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high';

export type UpUpDataPolicy = 'live' | 'delayed' | 'historical' | 'cached' | 'offline';

export type UpUpOutputContract = 'markdown' | 'json' | 'report' | 'evidence';

export type UpUpToolSafetyLevel = 'safe' | 'warning' | 'dangerous' | 'critical';

export type UpUpToolCategory =
  | 'finance'
  | 'market'
  | 'research'
  | 'valuation'
  | 'portfolio'
  | 'risk'
  | 'trading'
  | 'filesystem'
  | 'network'
  | 'system';

export interface UpUpPermissionProfile {
  id: string;
  allow: readonly UpUpToolSafetyLevel[];
  requireApproval: readonly UpUpToolSafetyLevel[];
  deny: readonly UpUpToolSafetyLevel[];
  allowExternalNetwork: boolean;
  allowCredentialAccess: boolean;
  allowFinancialWrites: boolean;
}

export type UpUpToolPolicyDecision =
  | 'allowed'
  | 'denied'
  | 'approval_required'
  | 'approval_granted'
  | 'approval_denied';

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

export interface UpUpToolContract<TInput = unknown, TResult = unknown> {
  name: string;
  label: string;
  description: string;
  category: UpUpToolCategory;
  safetyLevel: UpUpToolSafetyLevel;
  parameters: TSchema;
  concurrencyKey?: string | ((input: TInput) => string | undefined);
  maxConcurrent?: number;
  hasFinancialImpact: boolean;
  execute(input: TInput, context: UpUpToolContext): Promise<UpUpToolResult<TResult>>;
}

export interface UpUpToolContext {
  signal: AbortSignal;
  agent: UpUpAgentSpec;
  toolCallId: string;
  onUpdate?: (update: UpUpToolUpdate) => void;
  auditId: string;
}

export interface UpUpToolUpdate {
  text: string;
  progress?: number;
}

export interface UpUpToolResult<TResult> {
  value: TResult;
  text: string;
  details?: FinancialToolDetails;
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

export interface UpUpAgentRuntime {
  createSession(spec: UpUpAgentSpec, options?: UpUpCreateSessionOptions): Promise<UpUpAgentSession>;
}

export interface UpUpCreateSessionOptions {
  cwd?: string;
  sessionPath?: string;
  sessionDir?: string;
  sessionId?: string;
  tools?: readonly UpUpToolContract[];
  loadRegisteredTools?: boolean;
  signal?: AbortSignal;
  model?: Model<any>;
  modelRuntime?: ModelRuntime;
  requestToolApproval?: (request: {
    tool: string;
    input: unknown;
    safetyLevel: UpUpToolSafetyLevel;
    auditId: string;
    permissionProfile: string;
  }) => boolean | Promise<boolean>;
  additionalSkillPaths?: readonly string[];
  additionalPromptTemplatePaths?: readonly string[];
  additionalExtensionPaths?: readonly string[];
  /** Pinned Pi package roots; their declared resources are loaded only after trust verification. */
  piPackagePaths?: readonly string[];
  piPackageTrust?: PiPluginTrustPolicy;
  pluginTrust?: PiPluginTrustPolicy;
  piPlugins?: readonly PiPluginBinding[];
}
