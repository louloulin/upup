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
import { setInvestCommandHandler, runInvest, runInvestmentCommand } from '@upup/pi-investment-workflow';
import { setPiFinanceCommandRunners } from '@upup/pi-finance-sdk';
import type { PiCanonicalEventStream } from '@upup/pi-event-adapter';
import type { PiSessionService } from '@upup/pi-session';
import type { PiBackgroundService } from '@upup/pi-session';
import type { TuiRuntime } from '@upup/pi-tui-app';
import type { TuiCommandCapabilities } from '@upup/pi-tui-app';

export type PiBackgroundRuntimePort = Pick<PiBackgroundService, 'start'>;

export interface PiStdioRuntimePort {
  readonly streamPiEvents: PiCanonicalEventStream;
  readonly sessionService: PiSessionService;
}

export interface PiEventStreamPort {
  readonly stream: PiCanonicalEventStream;
}

export interface PiTuiEventStreamPort {
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
  readonly tuiRuntimeFactory?: () => TuiRuntime;
  readonly commandCapabilitiesFactory?: () => TuiCommandCapabilities;
  readonly gatewayAgentRuntime?: GatewayAgentRuntimePort;
  readonly gatewayConfigRuntime?: GatewayConfigRuntimePort;
  readonly gatewayCronRuntime?: GatewayCronRuntimePort;
  readonly stdioRuntimeFactory?: () => PiStdioRuntimePort;
  readonly eventStreamFactory?: () => PiEventStreamPort;
  readonly tuiEventStreamFactory?: () => PiTuiEventStreamPort;
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
  getStdioRuntime(): PiStdioRuntimePort;
  getEventStream(): PiEventStreamPort;
  getTuiEventStream(): PiTuiEventStreamPort;
  getInvestmentWorkflow(): PiInvestmentWorkflow;
  getGatewayRuntime(): GatewayRuntime;
  getSessionFactory(): PiSessionFactory;
  getBackgroundRuntime(): PiBackgroundRuntimePort;
  getTuiRuntime(): TuiRuntime;
  getCommandCapabilities(): TuiCommandCapabilities;
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
      setInvestCommandHandler(options.investCommandHandler ?? null);
      // Wire the pi-finance-sdk investment command runners from the canonical
      // @upup/pi-investment-workflow registry. This lets the extension's
      // /invest, /dossier, /risk-dashboard etc. commands drive the real
      // five-phase pipeline (detect -> plan -> execute -> verify -> report)
      // instead of the previous LLM prompt-nudge. The injection lives in
      // pi-app because declaring a direct dependency from pi-finance-sdk
      // -> pi-investment-workflow would induce a package cycle (workflow
      // -> pi-research -> pi-finance-sdk).
      setPiFinanceCommandRunners({
        invest: (args: string) => runInvest(args),
        generic: (name: string, args: string) => runInvestmentCommand(name, args),
      });
      // Composition is observable from initialize() even before the runtime
      // itself is resolved, while still preserving the lazy runtime factory.
      resolvedComposition = resolveComposition();
      initialized = true;
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
    getStdioRuntime(): PiStdioRuntimePort {
      if (!initialized) throw new Error('Pi app must be initialized before accessing stdio runtime');
      const factory = assertOption(options.stdioRuntimeFactory, 'stdioRuntimeFactory');
      return factory();
    },
    getEventStream(): PiEventStreamPort {
      if (!initialized) throw new Error('Pi app must be initialized before accessing event stream');
      const factory = assertOption(options.eventStreamFactory, 'eventStreamFactory');
      return factory();
    },
    getTuiEventStream(): PiTuiEventStreamPort {
      if (!initialized) throw new Error('Pi app must be initialized before accessing TUI event stream');
      const factory = assertOption(options.tuiEventStreamFactory, 'tuiEventStreamFactory');
      return factory();
    },
    getInvestmentWorkflow(): PiInvestmentWorkflow {
      if (!initialized) throw new Error('Pi app must be initialized before accessing investment workflow');
      const workflow = getInvestmentWorkflow();
      setInvestCommandHandler(options.investCommandHandler ?? workflow.commandHandler);
      return workflow;
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
    getTuiRuntime(): TuiRuntime {
      if (!initialized) throw new Error('Pi app must be initialized before accessing TUI runtime');
      const factory = assertOption(options.tuiRuntimeFactory, 'tuiRuntimeFactory');
      return factory();
    },
    getCommandCapabilities(): TuiCommandCapabilities {
      if (!initialized) throw new Error('Pi app must be initialized before accessing command capabilities');
      return options.commandCapabilitiesFactory?.() ?? {};
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
