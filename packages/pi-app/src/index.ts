import {
  type GatewayAgentRuntimePort,
  type GatewayConfigRuntimePort,
  type GatewayCronRuntimePort,
  type GatewayRuntime,
} from '@upup/gateway';
import {
  builtinSessionComposition,
  builtinSessionFinanceComposition,
  builtinSessionPlatformComposition,
  builtinSessionPromptComposition,
  configurePiBackgroundService,
  configurePiSessionService,
  disposePiBackgroundService,
  disposePiSessionService,
  disposePiSessions,
  isPiSessionServiceConfigured,
  isPiBackgroundServiceConfigured,
  type PiBackgroundPromptRunner,
  type PiSessionCompositionProviders,
  type PiSessionFinanceProviders,
  type PiSessionPlatformProviders,
  type PiSessionPromptProviders,
} from '@upup/pi-session';
import type { PiSessionFactory, UpUpAgentRuntime } from '@upup/pi-runtime';
import type { PiPromptPort } from '@upup/pi-runtime';
import type {
  InvestmentSessionFactory,
  InvestmentWorkflowOptions,
  WorkflowResult,
  InvestmentCommandHandler,
} from '@upup/pi-investment-workflow';
import { setInvestCommandHandler, runInvestmentCommand, listInvestmentCommands } from '@upup/pi-investment-workflow';
import { setPiFinanceCommandRunners } from '@upup/pi-finance-sdk';
import type { PiCanonicalEventStream } from '@upup/pi-event-adapter';
import type { PiBackgroundService } from '@upup/pi-session';

export type PiBackgroundRuntimePort = Pick<PiBackgroundService, 'start'>;

export interface PiEventStreamPort {
  readonly stream: PiCanonicalEventStream;
}

/**
 * Session runtime factory bound to the Pi app boundary.
 *
 * Receives the composition provider resolved by {@link PiAppOptions.sessionCompositionProvider}
 * (or `undefined` when no provider is configured). Implementations should honor the
 * injected composition so that the Pi Session boundary remains replaceable without
 * rewriting Session orchestration.
 */
export type PiAppSessionRuntimeFactory = (composition?: PiSessionCompositionProviders) => UpUpAgentRuntime;

export interface PiAppOptions {
  readonly sessionRuntimeFactory: PiAppSessionRuntimeFactory;
  readonly backgroundPromptRunner: () => PiBackgroundPromptRunner;
  readonly promptPort: PiPromptPort;
  /**
   * Optional combined composition provider accepted by `sessionRuntimeFactory`.
   * When this is supplied it takes precedence over the split providers below
   * so that callers who only need one full override can keep using a single
   * argument. PiApp never instantiates concrete business composition and
   * treats the provider as an opaque, replaceable boundary.
   */
  readonly sessionCompositionProvider?: PiSessionCompositionProviders;
  /**
   * Optional finance-side composition override. When supplied it replaces
   * the corresponding half of the combined provider. Combined provider wins
   * over split providers when both are supplied.
   */
  readonly sessionFinanceProvider?: PiSessionFinanceProviders;
  /**
   * Optional platform-side composition override (cron, MCP, workers). When
   * supplied it replaces the corresponding half of the combined provider.
   */
  readonly sessionPlatformProvider?: PiSessionPlatformProviders;
  /**
   * Optional prompt composition override (default system prompt, capabilities
   * section, coach prompt). The runtime boundary does not import concrete
   * prompt implementations; this provider is the only place where
   * `@upup/pi-prompt-config` (or a replacement) is wired into the session.
   */
  readonly sessionPromptProvider?: PiSessionPromptProviders;
  readonly backgroundRuntimeFactory?: () => PiBackgroundRuntimePort;
  readonly gatewayAgentRuntime?: GatewayAgentRuntimePort;
  readonly gatewayConfigRuntime?: GatewayConfigRuntimePort;
  readonly gatewayCronRuntime?: GatewayCronRuntimePort;
  readonly eventStreamFactory?: () => PiEventStreamPort;
  readonly investCommandHandler?: InvestmentCommandHandler | null;
  readonly investmentRuntimeFactory?: PiAppSessionRuntimeFactory;
  readonly investmentWorkflowFactory?: (sessionRuntimeFactory: PiAppSessionRuntimeFactory) => PiInvestmentWorkflow;
  readonly investmentCwd?: string;
}

export interface PiInvestmentWorkflow {
  readonly sessionFactory: InvestmentSessionFactory;
  readonly runInvestmentWorkflow: (intent: string, options?: InvestmentWorkflowOptions) => Promise<WorkflowResult>;
  readonly resumeInvestmentWorkflow: (planId: string, options?: Omit<InvestmentWorkflowOptions, 'ticker' | 'phases'>) => Promise<WorkflowResult>;
  readonly resumeWorkflow: (planId: string, options?: Omit<InvestmentWorkflowOptions, 'ticker' | 'phases'>) => Promise<WorkflowResult>;
  readonly forkWorkflowSession: (planId: string, entryId?: string) => Promise<string | undefined>;
  readonly runInvest: (args: string) => Promise<string>;
  readonly commandHandler: InvestmentCommandHandler;
}

export interface PiApp {
  readonly initialized: boolean;
  initialize(): void;
  dispose(): Promise<void>;
  getEventStream(): PiEventStreamPort;
  getInvestmentWorkflow(): PiInvestmentWorkflow;
  getGatewayRuntime(): GatewayRuntime;
  getSessionFactory(): PiSessionFactory;
  getBackgroundRuntime(): PiBackgroundRuntimePort;
  getPromptRunner(): PiPromptPort['runPrompt'];
  /**
   * Returns the composition provider resolved at the last initialize() call.
   * `undefined` means no provider was supplied to {@link PiAppOptions}.
   * Always re-reads the latest value (suitable for tests asserting
   * initialize/dispose cycles).
   */
  getSessionCompositionProvider(): PiSessionCompositionProviders | undefined;
}

function assertOption<T>(value: T | undefined, name: string): T {
  if (value === undefined || value === null) throw new Error(`Pi app requires ${name}`);
  return value;
}

/**
 * Compose the process-wide Pi Native application boundary.
 *
 * This package only wires explicit ports. It never creates an AgentSession,
 * discovers tools, imports root `src`, or owns provider state.
 */
export function createPiApp(options: PiAppOptions): PiApp {
  const sessionRuntimeFactory = assertOption(options.sessionRuntimeFactory, 'sessionRuntimeFactory');
  const backgroundPromptRunner = assertOption(options.backgroundPromptRunner, 'backgroundPromptRunner');
  const promptPort = assertOption(options.promptPort, 'promptPort');
  const gatewayAgentRuntime = options.gatewayAgentRuntime;
  const gatewayConfigRuntime = options.gatewayConfigRuntime;
  const gatewayCronRuntime = options.gatewayCronRuntime;
  let initialized = false;
  let sessionRuntime: PiSessionFactory | undefined;
  let resolvedComposition: PiSessionCompositionProviders | undefined;
  // Resolve the effective composition: explicit combined provider wins,
  // otherwise merge split providers over the built-in halves so callers can
  // override finance or platform independently without supplying both.
  const resolveComposition = (): PiSessionCompositionProviders => {
    if (options.sessionCompositionProvider) return options.sessionCompositionProvider;
    const finance: PiSessionFinanceProviders = options.sessionFinanceProvider ?? builtinSessionFinanceComposition;
    const platform: PiSessionPlatformProviders = options.sessionPlatformProvider ?? builtinSessionPlatformComposition;
    const prompt: PiSessionPromptProviders = options.sessionPromptProvider ?? builtinSessionPromptComposition;
    return { ...finance, ...platform, ...prompt };
  };
  const getSessionRuntime = (): PiSessionFactory => {
    if (!sessionRuntime) {
      resolvedComposition = resolveComposition();
      sessionRuntime = sessionRuntimeFactory(resolvedComposition);
    }
    return sessionRuntime;
  };
  let investmentWorkflow: PiInvestmentWorkflow | undefined;
  const getInvestmentWorkflow = (): PiInvestmentWorkflow => {
    if (!initialized) throw new Error('Pi app must be initialized before accessing investment workflow');
    if (!investmentWorkflow) {
      if (!options.investmentWorkflowFactory) throw new Error('Pi app was created without an investment workflow');
      investmentWorkflow = options.investmentWorkflowFactory(options.investmentRuntimeFactory ?? sessionRuntimeFactory);
    }
    return investmentWorkflow;
  };

  const app: PiApp = {
    get initialized(): boolean {
      return initialized;
    },
    initialize(): void {
      if (initialized && isPiSessionServiceConfigured() && isPiBackgroundServiceConfigured()) return;
      if (initialized) {
        initialized = false;
        sessionRuntime = undefined;
        resolvedComposition = undefined;
        investmentWorkflow = undefined;
      }
      configurePiSessionService(getSessionRuntime);
      configurePiBackgroundService(backgroundPromptRunner);
      // Mark as initialized before we touch `getInvestmentWorkflow()`, so
      // its own "must be initialized" guard does not reject the very call
      // that the initializer wants to make.
      initialized = true;
      // Resolve the singleton investment workflow eagerly and bind its
      // session-factory-aware command handler before any slash command
      // can fire. Previously `setInvestCommandHandler(options.investCommandHandler ?? null)`
      // ran first and `workflow.commandHandler` was only wired later (inside
      // `getInvestmentWorkflow()`), which meant the very first `/invest`
      // Only resolve the investment workflow eagerly when the caller actually
      // supplies an `investmentWorkflowFactory` (or their own `investCommandHandler`).
      // The previous version always called `getInvestmentWorkflow()` here, which
      // threw "Pi app was created without an investment workflow" for non-investment
      // hosts (gateway/stream/composition contract tests).
      if (options.investCommandHandler !== undefined) {
        setInvestCommandHandler(options.investCommandHandler);
      } else if (options.investmentWorkflowFactory) {
        const workflowInstance = getInvestmentWorkflow();
        setInvestCommandHandler(workflowInstance.commandHandler);
        // Wire the pi-finance-sdk investment command runners from the canonical
        // @upup/pi-investment-workflow registry. This lets the extension's
        // /invest, /dossier, /risk-dashboard etc. commands drive the real
        // five-phase pipeline (detect -> plan -> execute -> verify -> report)
        // instead of the previous LLM prompt-nudge. The injection lives in
        // pi-app because declaring a direct dependency from pi-finance-sdk
        // -> pi-investment-workflow would induce a package cycle (workflow
        // -> pi-research -> pi-finance-sdk).
        setPiFinanceCommandRunners({
          // Route `/invest` through `workflow.runInvest` (which holds the
          // sessionFactory), NOT through the bare `runInvest` export — the
          // bare export requires the caller to pass `InvestmentWorkflowOptions.sessionFactory`
          // themselves, and the TUI slash command has no way to do that.
          invest: (args: string) => workflowInstance.runInvest(args),
          generic: (name: string, args: string) => Promise.resolve(runInvestmentCommand(name, args)),
          // Single source of truth for the investment command surface: names,
          // aliases and descriptions all come from the workflow registry.
          commands: listInvestmentCommands().map((entry) => ({
            name: entry.name,
            aliases: entry.aliases,
            description: entry.description,
          })),
        });
      }
      // Else: caller supplied neither — non-investment host (gateway / stream /
      // composition contract tests). /invest is intentionally not bound.
      // Composition is observable from initialize() even before the runtime
      // itself is resolved, while still preserving the lazy runtime factory.
      resolvedComposition = resolveComposition();
      // Bridge every UpUp SOP into pi-subagents' DAG scheduler. Each
      // built-in + user SOP becomes a workflow resource named
      // `upup-sop__<sopId>` so any host that speaks pi-subagents (TradingAgents,
      // Codex, Claude Code via pi-claude-bridge) can run UpUp SOPs through
      // the same primitive Pi itself uses for its own workflows. Best-effort:
      // a missing pi-subagents or a malformed SOP file is logged, not raised.
      void (async () => {
        try {
          const { bridgeUpUpSopsToWorkflowResources } = await import('@upup/pi-investment-workflow');
          await bridgeUpUpSopsToWorkflowResources({
            sessionId: 'upup-session',
            onError: (where: string, error: unknown) => {
              process.stderr.write(`[upup-sop-bridge] ${where}: ${String(error)}\n`);
            },
          });
        } catch (error) {
          process.stderr.write(`[upup-sop-bridge] skipped: ${String(error)}\n`);
        }
      })();
    },
    async dispose(): Promise<void> {
      if (!initialized) return;
      setInvestCommandHandler(null);
      setPiFinanceCommandRunners({});
      disposePiSessions();
      disposePiBackgroundService();
      await disposePiSessionService();
      sessionRuntime = undefined;
      resolvedComposition = resolveComposition();
      investmentWorkflow = undefined;
      initialized = false;
    },
    getEventStream(): PiEventStreamPort {
      if (!initialized) throw new Error('Pi app must be initialized before accessing event stream');
      const factory = assertOption(options.eventStreamFactory, 'eventStreamFactory');
      return factory();
    },
    getInvestmentWorkflow(): PiInvestmentWorkflow {
      if (!initialized) throw new Error('Pi app must be initialized before accessing investment workflow');
      return getInvestmentWorkflow();
    },
    getGatewayRuntime(): GatewayRuntime {
      if (!initialized) throw new Error('Pi app must be initialized before accessing gateway runtime');
      return {
        agent: assertOption(gatewayAgentRuntime, 'gatewayAgentRuntime'),
        config: assertOption(gatewayConfigRuntime, 'gatewayConfigRuntime'),
        cron: assertOption(gatewayCronRuntime, 'gatewayCronRuntime'),
      };
    },
    getSessionFactory(): PiSessionFactory {
      if (!initialized) throw new Error('Pi app must be initialized before accessing session factory');
      return getSessionRuntime();
    },
    getBackgroundRuntime(): PiBackgroundRuntimePort {
      if (!initialized) throw new Error('Pi app must be initialized before accessing background runtime');
      const factory = assertOption(options.backgroundRuntimeFactory, 'backgroundRuntimeFactory');
      return factory();
    },
    getPromptRunner(): PiPromptPort['runPrompt'] {
      if (!initialized) throw new Error('Pi app must be initialized before accessing prompt runner');
      return promptPort.runPrompt.bind(promptPort);
    },
    getSessionCompositionProvider(): PiSessionCompositionProviders | undefined {
      return initialized ? resolvedComposition : undefined;
    },
  };

  return app;
}
