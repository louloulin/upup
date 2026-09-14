import type { ModelRuntime } from '@earendil-works/pi-coding-agent';
import type { UpUpAgentSpec } from '@upup/pi-runtime';

export type PlatformResearchRole = 'technical-analysis' | 'fundamental-analysis' | 'capital-flow' | 'sentiment-analysis';

export interface PlatformPromptOptions {
  readonly model?: string;
  readonly signal: AbortSignal;
  readonly sessionKey: string;
  readonly systemPrompt?: string;
  readonly toolFilter: readonly string[] | '*';
  readonly agentSpec: UpUpAgentSpec;
  readonly modelInstance?: unknown;
  readonly modelRuntime?: ModelRuntime;
}

export interface PlatformCompositionOptions {
  readonly sessionId: string;
  readonly spec: UpUpAgentSpec;
  readonly modelInstance?: unknown;
  readonly modelRuntime?: ModelRuntime;
  readonly runPrompt: (prompt: string, options: PlatformPromptOptions) => Promise<string>;
  readonly runCron: (job: unknown, modelInstance: unknown, modelRuntime: ModelRuntime | undefined) => Promise<void>;
  readonly listMcpResources: (server: string | undefined) => Promise<readonly { server: string; resources: readonly Record<string, unknown>[] }[]>;
  readonly readMcpResource: (uri: string, server: string | undefined) => Promise<{ server: string; contents: readonly Record<string, unknown>[] }>;
}

export interface PlatformComposition {
  readonly runResearchWorker: (request: { role: PlatformResearchRole; symbol: string; question: string; systemPrompt: string; allowedTools: readonly string[] }, signal: AbortSignal) => Promise<{ role: PlatformResearchRole; output: string; evidence: readonly unknown[]; sessionId?: string }>;
  readonly runAgentWorker: (request: { agentId: string; name: string; role: string; prompt: string; tools: readonly string[] | '*'; model?: string }, signal: AbortSignal) => Promise<{ agentId: string; output: string; sessionId: string }>;
  readonly runCronJob: (request: { job: unknown }, signal: AbortSignal) => Promise<void>;
  readonly listMcpResources: (server: string | undefined, signal: AbortSignal) => Promise<readonly { server: string; resources: readonly Record<string, unknown>[] }[]>;
  readonly readMcpResource: (uri: string, server: string | undefined, signal: AbortSignal) => Promise<{ server: string; contents: readonly Record<string, unknown>[] }>;
}

export function createPlatformComposition(options: PlatformCompositionOptions): PlatformComposition {
  return {
    runResearchWorker: async (request, signal) => {
      const workerSessionId = `${options.sessionId}:research:${request.role}`;
      const workerSpec: UpUpAgentSpec = {
        ...options.spec,
        id: `research-worker-${request.role}`,
        name: `Research Worker: ${request.role}`,
        description: request.systemPrompt,
        mode: 'subagent',
        tools: [...request.allowedTools],
        capabilities: ['financial-research', request.role],
        taskTypes: ['research'],
        permissions: { ...options.spec.permissions, allowFinancialWrites: false, deny: ['dangerous', 'critical'] },
        outputContract: 'evidence',
      };
      const output = await options.runPrompt(`请分析 ${request.symbol}。研究问题：${request.question}`, {
        model: workerSpec.model, signal, sessionKey: workerSessionId, systemPrompt: request.systemPrompt,
        toolFilter: [...request.allowedTools], agentSpec: workerSpec, ...(options.modelInstance ? { modelInstance: options.modelInstance } : {}), ...(options.modelRuntime ? { modelRuntime: options.modelRuntime } : {}),
      });
      return { role: request.role as PlatformResearchRole, output, evidence: [{ source: `upup-pi://research-worker/${request.role}`, sessionId: workerSessionId }], sessionId: workerSessionId };
    },
    runAgentWorker: async (request, signal) => {
      const safeAgentId = request.agentId.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 120) || 'agent-worker';
      const workerSessionId = `${options.sessionId}:agent:${safeAgentId}`;
      const workerSpec: UpUpAgentSpec = {
        ...options.spec,
        id: `platform-worker-${safeAgentId}`,
        name: request.name,
        description: `Pi platform worker: ${request.role}`,
        mode: 'worker',
        tools: request.tools === '*' ? '*' : [...request.tools],
        ...(request.model ? { model: request.model } : {}),
        capabilities: ['platform-worker', request.role], taskTypes: ['platform-worker'],
        permissions: { ...options.spec.permissions, id: 'pi-platform-worker-read-only', allow: ['safe', 'warning'], requireApproval: [], deny: ['dangerous', 'critical'], allowFinancialWrites: false },
        outputContract: 'markdown',
      };
      const output = await options.runPrompt(request.prompt, { model: workerSpec.model, signal, sessionKey: workerSessionId, toolFilter: request.tools === '*' ? '*' : [...request.tools], agentSpec: workerSpec, ...(options.modelInstance ? { modelInstance: options.modelInstance } : {}), ...(options.modelRuntime ? { modelRuntime: options.modelRuntime } : {}) });
      return { agentId: request.agentId, output, sessionId: workerSessionId };
    },
    runCronJob: async (request, signal) => {
      if (signal.aborted) throw new Error('cron run request aborted');
      await options.runCron(request.job, options.modelInstance, options.modelRuntime);
    },
    listMcpResources: async (server, signal) => {
      if (signal.aborted) throw new Error('MCP resource request aborted');
      return options.listMcpResources(server);
    },
    readMcpResource: async (uri, server, signal) => {
      if (signal.aborted) throw new Error('MCP resource request aborted');
      return options.readMcpResource(uri, server);
    },
  };
}
