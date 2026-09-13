export interface PlatformSwarmMember {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly status: 'active' | 'idle' | 'busy';
  readonly joinedAt: number;
  readonly lastActivity: number;
}

export interface PlatformSwarmTeam {
  readonly name: string;
  readonly lead: string;
  readonly members: readonly PlatformSwarmMember[];
  readonly description: string;
  readonly createdAt: number;
  readonly status: 'active' | 'paused' | 'completed';
}

export interface PlatformSwarmAgent {
  readonly id: string;
  readonly teamName: string;
  readonly name: string;
  readonly role: string;
  readonly status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  readonly createdAt: number;
  readonly startedAt?: number;
  readonly completedAt?: number;
  readonly result?: string;
  readonly error?: string;
}

export interface PlatformSwarmMessage {
  readonly from: string;
  readonly to: string;
  readonly content: string;
  readonly timestamp: number;
}

export interface PlatformSwarmState {
  readonly schema: 1;
  readonly teams: readonly PlatformSwarmTeam[];
  readonly agents: readonly PlatformSwarmAgent[];
  readonly messages: readonly PlatformSwarmMessage[];
}

const MAX_ITEMS = 1_000;

function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function stringValue(value: unknown): value is string { return typeof value === 'string'; }
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value); }

export function createInitialPlatformSwarmState(): PlatformSwarmState { return { schema: 1, teams: [], agents: [], messages: [] }; }

export function parsePlatformSwarmState(value: unknown): PlatformSwarmState {
  if (!record(value) || value.schema !== 1) return createInitialPlatformSwarmState();
  const teams = Array.isArray(value.teams) ? value.teams.filter(record).filter((team) => stringValue(team.name) && stringValue(team.lead) && Array.isArray(team.members) && stringValue(team.description) && finite(team.createdAt) && ['active', 'paused', 'completed'].includes(String(team.status))).slice(-MAX_ITEMS) : [];
  const agents = Array.isArray(value.agents) ? value.agents.filter(record).filter((agent) => stringValue(agent.id) && stringValue(agent.teamName) && stringValue(agent.name) && stringValue(agent.role) && finite(agent.createdAt) && ['pending', 'running', 'completed', 'failed', 'cancelled'].includes(String(agent.status))).slice(-MAX_ITEMS) : [];
  const messages = Array.isArray(value.messages) ? value.messages.filter(record).filter((message) => stringValue(message.from) && stringValue(message.to) && stringValue(message.content) && finite(message.timestamp)).slice(-MAX_ITEMS) : [];
  return { schema: 1, teams: teams as unknown as PlatformSwarmTeam[], agents: agents as unknown as PlatformSwarmAgent[], messages: messages as unknown as PlatformSwarmMessage[] };
}

export function createPlatformSwarmTeam(state: PlatformSwarmState, input: { name: string; description?: string; agentType?: string }, now: number, id: string): PlatformSwarmState {
  const lead: PlatformSwarmMember = { id: `${id}:lead`, name: `${input.name}-lead`, role: input.agentType ?? 'lead', status: 'active', joinedAt: now, lastActivity: now };
  const team: PlatformSwarmTeam = { name: input.name, lead: lead.id, members: [lead], description: input.description ?? '', createdAt: now, status: 'active' };
  return { ...state, teams: [...state.teams, team].slice(-MAX_ITEMS) };
}

export function addPlatformSwarmAgent(state: PlatformSwarmState, input: { id: string; teamName: string; name: string; role: string }, now: number): PlatformSwarmState {
  const teams = state.teams.map((team) => team.name === input.teamName ? { ...team, members: [...team.members, { id: input.id, name: input.name, role: input.role, status: 'busy' as const, joinedAt: now, lastActivity: now }] } : team);
  const agent: PlatformSwarmAgent = { ...input, status: 'pending', createdAt: now };
  return { ...state, teams, agents: [...state.agents, agent].slice(-MAX_ITEMS) };
}

export function updatePlatformSwarmAgent(state: PlatformSwarmState, id: string, update: Pick<PlatformSwarmAgent, 'status'> & Partial<Pick<PlatformSwarmAgent, 'result' | 'error' | 'startedAt' | 'completedAt'>>, now: number): PlatformSwarmState {
  const agent = state.agents.find((candidate) => candidate.id === id);
  if (!agent) return state;
  return { ...state, agents: state.agents.map((candidate) => candidate.id === id ? { ...candidate, ...update } : candidate), teams: state.teams.map((team) => ({ ...team, members: team.members.map((member) => member.id === id ? { ...member, status: update.status === 'completed' || update.status === 'failed' ? 'idle' as const : 'busy' as const, lastActivity: now } : member) })) };
}

export function addPlatformSwarmMessage(state: PlatformSwarmState, message: PlatformSwarmMessage): PlatformSwarmState {
  if (!state.agents.some((agent) => agent.id === message.from) || !state.agents.some((agent) => agent.id === message.to)) return state;
  return { ...state, messages: [...state.messages, message].slice(-MAX_ITEMS) };
}
