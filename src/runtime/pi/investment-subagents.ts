import { getAgentRegistry, type AgentCapability, type PiAgentMetadata } from './registry.js';
import { INVESTMENT_PROFILES } from './agent-spec.js';

const CAPABILITIES: readonly AgentCapability[] = [
  'research', 'coding', 'debugging', 'refactoring', 'testing', 'documentation',
  'deployment', 'review', 'analysis',
];

const investmentSubagents: ReadonlyArray<PiAgentMetadata> = Object.values(INVESTMENT_PROFILES).map((spec) => ({
  id: spec.id,
  name: spec.name,
  description: spec.description,
  version: spec.version,
  capabilities: spec.capabilities.filter((capability): capability is AgentCapability =>
    CAPABILITIES.includes(capability as AgentCapability),
  ),
  taskTypes: [...spec.taskTypes],
  systemPrompt: spec.systemPrompt ?? `${spec.name}: ${spec.description}`,
  ...(spec.model ? { preferredModel: spec.model } : {}),
  config: spec.tools === '*' ? undefined : { toolWhitelist: [...spec.tools] },
  isBuiltIn: true,
}));

let registered = false;

export function registerInvestmentSubagents(): void {
  const registry = getAgentRegistry();
  if (registered && investmentSubagents.every((agent) => registry.has(agent.id))) return;
  for (const agent of investmentSubagents) registry.register(agent);
  registered = true;
}

export function unregisterInvestmentSubagents(): void {
  if (!registered) return;
  const registry = getAgentRegistry();
  for (const agent of investmentSubagents) registry.unregister(agent.id, true);
  registered = false;
}

export function areInvestmentSubagentsRegistered(): boolean {
  return registered;
}

export function getInvestmentSubagents(): ReadonlyArray<PiAgentMetadata> {
  return investmentSubagents;
}

export function getInvestmentSubagent(id: string): PiAgentMetadata | undefined {
  return investmentSubagents.find((agent) => agent.id === id);
}

registerInvestmentSubagents();
