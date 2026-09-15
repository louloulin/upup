import type {
  AgentSession,
  AgentToolResult,
  InlineExtension,
} from '@earendil-works/pi-coding-agent';
import { mapAgentSessionEventToUpUp } from '@upup/pi-event-adapter';
import {
  canUseTool,
  classifyPiSideEffect,
  FINANCE_CONTEXT_ENTRY_TYPE,
  mergeFinanceSessionContext,
  type PiCapabilityContext,
  type PiEvalResult,
  type PiPackageContracts,
  type PiPackageResourceSnapshot,
  type PiResourceTrustAudit,
  type UpUpAgentEvent,
  type UpUpAgentSession,
  type UpUpAgentSpec,
  type UpUpFinanceSessionContext,
  type UpUpToolPolicyAudit,
  type PiSideEffectDeclaration,
} from '@upup/pi-runtime';

export interface PiSessionEvaluationInput {
  name: string;
  value: unknown;
}

export type PiSessionEvaluation = (input: PiSessionEvaluationInput) => PiEvalResult;

export interface PiSessionAdapterOptions {
  spec: UpUpAgentSpec;
  session: AgentSession;
  resourceTrustAudit: readonly PiResourceTrustAudit[];
  packageResources: readonly PiPackageResourceSnapshot[];
  packageContracts: PiPackageContracts;
  financeContext: UpUpFinanceSessionContext;
  capabilityContext: PiCapabilityContext;
  sideEffectDeclarations: readonly PiSideEffectDeclaration[];
  requestToolApproval?: (request: { tool: string; input: unknown; safetyLevel: import('@upup/pi-runtime').UpUpToolSafetyLevel; auditId: string; permissionProfile: string }) => boolean | Promise<boolean>;
  evaluatePackage: PiSessionEvaluation;
  disposePackageHosts?: () => Promise<void>;
}

/**
 * UpUp's public session adapter around the Pi AgentSession.
 *
 * The adapter owns session lifecycle, event translation, finance context
 * persistence, exports, tool execution, and package evaluation. Runtime
 * composition injects only the already-created Pi session and immutable
 * package metadata, so this package has no dependency on root `src`.
 */
export class PiSessionAdapter implements UpUpAgentSession {
  readonly id: string;
  readonly spec: UpUpAgentSpec;
  private readonly listeners = new Set<(event: UpUpAgentEvent) => void>();
  private readonly session: AgentSession;
  private readonly unsubscribe: () => void;
  private readonly resourceTrustAudit: readonly PiResourceTrustAudit[];
  private readonly packageResources: readonly PiPackageResourceSnapshot[];
  private readonly packageContracts: PiPackageContracts;
  private readonly capabilityContext: PiCapabilityContext;
  private readonly sideEffectDeclarations: readonly PiSideEffectDeclaration[];
  private readonly evaluatePackageContract: PiSessionEvaluation;
  private readonly disposePackageHosts: () => Promise<void>;
  private financeContext: UpUpFinanceSessionContext;
  private disposed = false;
  private readonly requestToolApproval: PiSessionAdapterOptions['requestToolApproval'];

  constructor(options: PiSessionAdapterOptions) {
    this.id = options.session.sessionManager.getSessionId();
    this.spec = options.spec;
    this.resourceTrustAudit = options.resourceTrustAudit;
    this.packageResources = options.packageResources;
    this.packageContracts = options.packageContracts;
    this.financeContext = options.financeContext;
    this.capabilityContext = options.capabilityContext;
    this.sideEffectDeclarations = options.sideEffectDeclarations;
    this.requestToolApproval = options.requestToolApproval;
    this.evaluatePackageContract = options.evaluatePackage;
    this.disposePackageHosts = options.disposePackageHosts ?? (async () => undefined);
    this.session = options.session;
    this.unsubscribe = options.session.subscribe((event) => {
      const mapped = mapAgentSessionEventToUpUp(this.id, event);
      if (mapped?.type === 'session_start') mapped.agentId = options.spec.id;
      if (mapped) {
        for (const listener of this.listeners) listener(mapped);
      }
    });
  }

  prompt(input: string, options?: { signal?: AbortSignal }): Promise<void> {
    if (this.disposed) return Promise.reject(new Error(`Pi session is disposed: ${this.id}`));
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

  steer(input: string): Promise<void> { return this.disposed ? Promise.reject(new Error(`Pi session is disposed: ${this.id}`)) : this.session.steer(input); }
  followUp(input: string): Promise<void> { return this.disposed ? Promise.reject(new Error(`Pi session is disposed: ${this.id}`)) : this.session.followUp(input); }
  abort(): Promise<void> { return this.disposed ? Promise.resolve() : this.session.abort(); }
  waitForIdle(): Promise<void> { return this.disposed ? Promise.resolve() : this.session.waitForIdle(); }
  compact(instructions?: string): Promise<void> { return this.disposed ? Promise.reject(new Error(`Pi session is disposed: ${this.id}`)) : this.session.compact(instructions).then(() => undefined); }

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
    if (this.disposed) throw new Error(`Pi session is disposed: ${this.id}`);
    this.session.sessionManager.appendCustomEntry(customType, data);
    const sessionFile = this.session.sessionManager.getSessionFile();
    if (sessionFile) this.session.exportToJsonl(sessionFile);
  }

  appendSessionInfo(name: string): void {
    if (this.disposed) throw new Error(`Pi session is disposed: ${this.id}`);
    this.session.sessionManager.appendSessionInfo(name);
    const sessionFile = this.session.sessionManager.getSessionFile();
    if (sessionFile) this.session.exportToJsonl(sessionFile);
  }

  setFinanceContext(context: Partial<UpUpFinanceSessionContext>): void {
    if (this.disposed) throw new Error(`Pi session is disposed: ${this.id}`);
    this.financeContext = mergeFinanceSessionContext(this.financeContext, context);
    this.appendEntry(FINANCE_CONTEXT_ENTRY_TYPE, this.financeContext);
  }

  getFinanceContext(): UpUpFinanceSessionContext {
    return {
      ...this.financeContext,
      assumptions: { ...this.financeContext.assumptions },
      risks: [...this.financeContext.risks],
      evidence: [...this.financeContext.evidence],
      unfinishedPhases: [...this.financeContext.unfinishedPhases],
    };
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

  async executeTool(name: string, toolCallId: string, input: unknown, signal = new AbortController().signal): Promise<AgentToolResult<unknown>> {
    if (this.disposed) throw new Error(`Pi session is disposed: ${this.id}`);
    const definition = this.session.getToolDefinition(name);
    if (!definition) throw new Error(`Pi tool not registered: ${name}`);
    const sideEffect = classifyPiSideEffect(name, this.sideEffectDeclarations);
    if (sideEffect) {
      const audit = (decision: UpUpToolPolicyAudit['decision'], reason: string) => ({
        auditId: toolCallId,
        tool: name,
        effect: sideEffect.effect,
        safetyLevel: sideEffect.safetyLevel,
        permissionProfile: this.spec.permissions.id,
        decision,
        reason,
        recordedAt: new Date().toISOString(),
      });
      const denied = (decision: UpUpToolPolicyAudit['decision'], reason: string) => ({
        content: [{ type: 'text' as const, text: `Pi side-effect policy denied ${name}: ${reason}` }],
        details: { auditId: toolCallId, policyAudit: audit(decision, reason) },
        isError: true,
      });
      if (!canUseTool(this.spec.permissions, sideEffect.safetyLevel)) {
        this.session.sessionManager.appendCustomEntry('upup_pi_policy_audit', audit('denied', `safety level ${sideEffect.safetyLevel} is not allowed`));
        return denied('denied', `safety level ${sideEffect.safetyLevel} is not allowed`);
      }
      if (sideEffect.effect === 'credential-access' && !this.spec.permissions.allowCredentialAccess) {
        this.session.sessionManager.appendCustomEntry('upup_pi_policy_audit', audit('denied', 'credential access is disabled'));
        return denied('denied', 'credential access is disabled');
      }
      if (sideEffect.effect === 'financial-write' && !this.spec.permissions.allowFinancialWrites) {
        this.session.sessionManager.appendCustomEntry('upup_pi_policy_audit', audit('denied', 'financial writes are disabled'));
        return denied('denied', 'financial writes are disabled');
      }
      if (sideEffect.effect === 'external-network' && !this.spec.permissions.allowExternalNetwork) {
        this.session.sessionManager.appendCustomEntry('upup_pi_policy_audit', audit('denied', 'external network access is disabled'));
        return denied('denied', 'external network access is disabled');
      }
      if (!this.requestToolApproval) {
        this.session.sessionManager.appendCustomEntry('upup_pi_policy_audit', audit('approval_denied', 'direct tool execution requires an explicit approval callback'));
        return denied('approval_denied', 'direct tool execution requires an explicit approval callback');
      }
      const approved = await this.requestToolApproval({ tool: name, input, safetyLevel: sideEffect.safetyLevel, auditId: toolCallId, permissionProfile: this.spec.permissions.id });
      if (!approved) {
        this.session.sessionManager.appendCustomEntry('upup_pi_policy_audit', audit('approval_denied', 'approval callback denied execution'));
        return denied('approval_denied', 'approval callback denied execution');
      }
      this.session.sessionManager.appendCustomEntry('upup_pi_policy_audit', audit('approval_granted', 'approval callback granted execution'));
    }
    return definition.execute(toolCallId, input, signal, undefined, {
      cwd: this.session.sessionManager.getCwd(),
      sessionManager: this.session.sessionManager,
    } as never);
  }

  getMessages(): readonly unknown[] { return this.session.agent.state.messages; }
  getResourceTrustAudit(): readonly PiResourceTrustAudit[] { return this.resourceTrustAudit; }
  getLoadedPackageResources(): readonly PiPackageResourceSnapshot[] { return this.packageResources; }
  getLoadedPackageContracts(): PiPackageContracts { return this.packageContracts; }

  evaluatePackage(name: string, value: unknown): PiEvalResult {
    return this.evaluatePackageContract({ name, value });
  }

  subscribe(listener: (event: UpUpAgentEvent) => void): () => void {
    this.listeners.add(listener);
    listener({ type: 'session_start', sessionId: this.id, agentId: this.spec.id });
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    this.listeners.clear();
    this.session.dispose();
    void this.disposePackageHosts();
    void this.capabilityContext.dispose();
  }
}

// =============================================================================
// Pi Host Bridge contract (foundation for finance + session capability bridge)
// =============================================================================
export * from './host-contract.js';

// =============================================================================
// Finance host contract (thin convenience wrapper for finance capability)
// =============================================================================
export * from './finance-host-contract.js';

// =============================================================================
// Persistent session service (background tasks + persistent sessions)
// =============================================================================
export * from './background-service.js';
export * from './session-service.js';

// =============================================================================
// Session orchestration helpers (state tracking, environment capture,
// restore, ephemeral filtering, context collapse, message chain, shared types)
// =============================================================================
export * from './session-state.js';
export * from './session-environment.js';
export * from './session-tracker.js';
export * from './context-collapse.js';
export * from './ephemeral-messages.js';
export * from './message-chain.js';
export * from './session-types.js';

// =============================================================================
// Session message renderer (used by CLI)
// =============================================================================
export * from './render/message-renderer.js';

// =============================================================================
// Legacy session migration helpers (one-shot data migration)
// =============================================================================
export * from './pi-migration.js';
export * from './migrate.js';
export * from './migrate-to-pi.js';
export * from './storage-portable.js';

// =============================================================================
// Persistent storage helpers (JSONL-backed session storage)
// =============================================================================
export * from './storage.js';
export * from './restore.js';
export * from './pid-manager.js';
export * from './selector.js';

// Pi Native runtime and prompt orchestration. These are the only public
// production entry points for creating AgentSession instances and running
// prompts; the root application must not import their implementation paths.
export * from './agent-session-factory.js';
export * from './prompt-runner.js';
export { PiSessionRegistry } from './session-registry.js';
export type { PiRunnerSessionState, PiSessionInitialization } from './session-registry.js';
export { withPiFileLock } from './file-lock.js';
export type { PiFileLockOptions } from './file-lock.js';

// Explicit composition boundary for PiApp and deterministic fixtures.
export {
  builtinSessionComposition,
  builtinSessionFinanceComposition,
  builtinSessionPlatformComposition,
  builtinSessionPromptComposition,
} from './builtin-composition.js';
export type {
  PiSessionCompositionProviders,
  PiSessionFinanceProviders,
  PiSessionPlatformProviders,
  PiSessionPromptProviders,
} from './builtin-composition.js';
