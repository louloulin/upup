import { PiAgentSessionFactory, type UpUpAgentSession, type UpUpAgentSpec } from '../../runtime/pi/index.js';
import type { SpawnAgentParams } from '../types.js';

export function createPiWorkerSpec(params: SpawnAgentParams): UpUpAgentSpec {
  if (params.spec) {
    return {
      ...params.spec,
      timeoutMs: params.spec.timeoutMs ?? params.timeoutMs ?? 300000,
    };
  }
  const role = params.role || 'general';
  const id = `worker-${role.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'agent'}`;
  return {
    id,
    version: '1.0.0',
    name: params.name,
    description: `Pi worker for ${role} tasks`,
    systemPrompt: params.prompt,
    tools: params.tools ?? '*',
    model: params.model,
    mode: 'worker',
    capabilities: [role],
    taskTypes: [role],
    permissions: {
      id: 'multi-agent-read-only',
      allow: ['safe', 'warning'],
      requireApproval: [],
      deny: ['dangerous', 'critical'],
      allowExternalNetwork: true,
      allowCredentialAccess: false,
      allowFinancialWrites: false,
    },
    timeoutMs: params.timeoutMs ?? 300000,
    outputContract: 'markdown',
  };
}

export async function createPiWorker(params: SpawnAgentParams): Promise<UpUpAgentSession> {
  return new PiAgentSessionFactory().createSession(createPiWorkerSpec(params), {
    cwd: params.cwd,
    loadRegisteredTools: true,
    ...(params.piModel ? { model: params.piModel } : {}),
    ...(params.piModelRuntime ? { modelRuntime: params.piModelRuntime } : {}),
  });
}

export function extractPiAssistantText(messages: readonly unknown[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || typeof message !== 'object' || !('role' in message) || message.role !== 'assistant') continue;
    const content = 'content' in message ? message.content : undefined;
    if (!Array.isArray(content)) continue;
    const text = content
      .filter((part): part is { type: 'text'; text: string } =>
        typeof part === 'object' && part !== null && 'type' in part && part.type === 'text' && 'text' in part && typeof part.text === 'string',
      )
      .map((part) => part.text)
      .join('\n');
    if (text) return text;
  }
  return undefined;
}
