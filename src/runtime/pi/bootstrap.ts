/**
 * Pi Native Bootstrap
 *
 * Wires Pi session/background services to the root Pi AgentSession factory
 * and the root Pi prompt runner. Call `bootstrapPiNativeServices()` once at
 * process startup (CLI, stdio, bridge, management, cron, daemon) before any
 * code calls `getPiSessionService()` or `getPiBackgroundService()`.
 */
import { configurePiSessionService, type PiSessionListItem } from '@upup/pi-session';
import { configurePiBackgroundService } from '@upup/pi-session';
import { registerGatewayAgentRuntime, registerGatewayConfigRuntime, registerGatewayCronRuntime } from '@upup/gateway';
import { registerPiRuntimePort } from '@upup/pi-runtime';
import { createPiAgentRuntime } from './agent-session-factory.js';
import { runPiPrompt } from './runner.js';
import { isPiSessionRunning } from './runner.js';
import { getConfiguredModelId, getConfiguredProvider } from '@upup/utils';
import { ensureHeartbeatCronJob, startCronRunner } from '@upup/cron';

let bootstrapped = false;

export function bootstrapPiNativeServices(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  configurePiSessionService(() => createPiAgentRuntime());
  configurePiBackgroundService(() => runPiPrompt);
  registerGatewayAgentRuntime({ isSessionRunning: isPiSessionRunning, runPrompt: runPiPrompt });
  registerGatewayConfigRuntime({ getConfiguredModelId, getConfiguredProvider });
  registerGatewayCronRuntime({ ensureHeartbeatCronJob, startCronRunner });
  registerPiRuntimePort('gateway.bootstrap', { bootstrap: bootstrapPiNativeServices });

  // Inject the /invest handler into @upup/pi-investment-workflow registry.
  // This is the ONLY place where the root Factory bridge is allowed to live.
  void import('@upup/pi-investment-workflow').then((mod) => {
    mod.setInvestCommandHandler(async (args: string) => {
      const { runInvest } = await import('@upup/pi-investment-workflow');
      return runInvest(args);
    });
  });
}

export type { PiSessionListItem };
