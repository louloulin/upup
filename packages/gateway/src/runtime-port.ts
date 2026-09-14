import type { Model } from '@earendil-works/pi-ai';
import type { ModelRuntime } from '@earendil-works/pi-coding-agent';
import type { UpUpAgentEvent } from '@upup/pi-runtime';

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
  startCronRunner: (params: { configPath?: string; runtime: GatewayRuntime }) => { stop: () => void };
};

export type GatewayConfigRuntimePort = {
  getConfiguredModelId: (fallback?: string) => string;
  getConfiguredProvider: (fallback?: string) => string;
};

export type GatewayRuntime = {
  agent: GatewayAgentRuntimePort;
  config: GatewayConfigRuntimePort;
  cron: GatewayCronRuntimePort;
};
