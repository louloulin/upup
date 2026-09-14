import type { Model } from '@earendil-works/pi-ai';
import type { ModelRuntime } from '@earendil-works/pi-coding-agent';
import type { UpUpAgentEvent } from '@upup/pi-runtime';
import { getPiRuntimePort, registerPiRuntimePort } from '@upup/pi-runtime';

export type GatewayAgentRuntimePort = {
  isSessionRunning: (sessionKey: string) => boolean;
  runPrompt: (prompt: string, options: {
    sessionKey?: string;
    model?: string;
    modelProvider?: string;
    signal?: AbortSignal;
    modelInstance?: Model<any>;
    modelRuntime?: ModelRuntime;
    onEvent?: (event: UpUpAgentEvent) => void | Promise<void>;
  }) => Promise<string>;
};

export type GatewayCronRuntimePort = {
  ensureHeartbeatCronJob: (configPath?: string) => Promise<void> | void;
  startCronRunner: (params: { configPath?: string }) => { stop: () => void };
};

export type GatewayConfigRuntimePort = {
  getConfiguredModelId: (fallback?: string) => string;
  getConfiguredProvider: (fallback?: string) => string;
};

const AGENT_PORT = 'gateway.agent-runtime';
const CRON_PORT = 'gateway.cron-runtime';
const CONFIG_PORT = 'gateway.config-runtime';

export function registerGatewayAgentRuntime(port: GatewayAgentRuntimePort): void {
  registerPiRuntimePort(AGENT_PORT, port);
}

export function registerGatewayCronRuntime(port: GatewayCronRuntimePort): void {
  registerPiRuntimePort(CRON_PORT, port);
}

export function registerGatewayConfigRuntime(port: GatewayConfigRuntimePort): void {
  registerPiRuntimePort(CONFIG_PORT, port);
}

export function getGatewayAgentRuntime(): GatewayAgentRuntimePort {
  const port = getPiRuntimePort<GatewayAgentRuntimePort>(AGENT_PORT);
  if (!port) throw new Error('Gateway agent runtime is not configured');
  return port;
}

export function getGatewayCronRuntime(): GatewayCronRuntimePort {
  const port = getPiRuntimePort<GatewayCronRuntimePort>(CRON_PORT);
  if (!port) throw new Error('Gateway cron runtime is not configured');
  return port;
}

export function getGatewayConfigRuntime(): GatewayConfigRuntimePort {
  const port = getPiRuntimePort<GatewayConfigRuntimePort>(CONFIG_PORT);
  if (!port) throw new Error('Gateway config runtime is not configured');
  return port;
}
