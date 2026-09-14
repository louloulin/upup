import type {
  AgentSession,
  AgentToolResult,
  InlineExtension,
} from '@earendil-works/pi-coding-agent';
import {
  mapAgentSessionEventToUpUp,
  type LegacyAgentEvent,
} from '@upup/pi-event-adapter';
import {
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
  evaluatePackage: PiSessionEvaluation;
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
  private readonly evaluatePackageContract: PiSessionEvaluation;
  private financeContext: UpUpFinanceSessionContext;

  constructor(options: PiSessionAdapterOptions) {
    this.id = options.session.sessionManager.getSessionId();
    this.spec = options.spec;
    this.resourceTrustAudit = options.resourceTrustAudit;
    this.packageResources = options.packageResources;
    this.packageContracts = options.packageContracts;
    this.financeContext = options.financeContext;
    this.capabilityContext = options.capabilityContext;
    this.evaluatePackageContract = options.evaluatePackage;
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

  setFinanceContext(context: Partial<UpUpFinanceSessionContext>): void {
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
    const definition = this.session.getToolDefinition(name);
    if (!definition) throw new Error(`Pi tool not registered: ${name}`);
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
    this.unsubscribe();
    this.listeners.clear();
    this.session.dispose();
    void this.capabilityContext.dispose();
  }
}
