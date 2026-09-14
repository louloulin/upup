import {
  type GatewayAgentRuntimePort,
  type GatewayConfigRuntimePort,
  type GatewayCronRuntimePort,
  type GatewayRuntime,
} from '@upup/gateway';
import {
  configurePiBackgroundService,
  configurePiSessionService,
  disposePiBackgroundService,
  disposePiSessionService,
  disposePiSessions,
  isPiSessionServiceConfigured,
  isPiBackgroundServiceConfigured,
  type PiBackgroundPromptRunner,
  type PiSessionServiceFactory,
} from '@upup/pi-session';
import type { PiSessionFactory } from '@upup/pi-runtime';
import type { PiPromptPort } from '@upup/pi-runtime';
import type {
  InvestmentSessionFactory,
  InvestmentWorkflowOptions,
  WorkflowResult,
  InvestmentCommandHandler,
} from '@upup/pi-investment-workflow';
import { setInvestCommandHandler } from '@upup/pi-investment-workflow';
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

export interface PiAppOptions {
  readonly sessionRuntimeFactory: PiSessionServiceFactory;
  readonly backgroundPromptRunner: () => PiBackgroundPromptRunner;
  readonly promptPort: PiPromptPort;
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
  readonly investmentRuntimeFactory?: PiSessionServiceFactory;
  readonly investmentWorkflowFactory?: (sessionRuntimeFactory: PiSessionServiceFactory) => PiInvestmentWorkflow;
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
  const getSessionRuntime = (): PiSessionFactory => {
    sessionRuntime ??= sessionRuntimeFactory();
    return sessionRuntime;
  };
  let investmentWorkflow: PiInvestmentWorkflow | undefined;
  const getInvestmentWorkflow = (): PiInvestmentWorkflow => {
    if (!initialized) throw new Error('Pi app must be initialized before accessing investment workflow');
    if (!investmentWorkflow) {
      if (!options.investmentWorkflowFactory) throw new Error('Pi app was created without an investment workflow');
      investmentWorkflow = options.investmentWorkflowFactory(options.investmentRuntimeFactory ?? getSessionRuntime);
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
        investmentWorkflow = undefined;
      }
      configurePiSessionService(getSessionRuntime);
      configurePiBackgroundService(backgroundPromptRunner);
      setInvestCommandHandler(options.investCommandHandler ?? null);
      initialized = true;
    },
    async dispose(): Promise<void> {
      if (!initialized) return;
      setInvestCommandHandler(null);
      disposePiSessions();
      disposePiBackgroundService();
      await disposePiSessionService();
      sessionRuntime = undefined;
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
  };

  return app;
}
