export type PlatformAgentStatus = 'pending' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';
export type PlatformAgentMemoryType = 'context' | 'result' | 'intermediate' | 'summary';

export interface PlatformAgentRecord {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly prompt: string;
  readonly tools: readonly string[] | '*';
  readonly model?: string;
  readonly status: PlatformAgentStatus;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly output?: string;
  readonly error?: string;
  readonly sessionId?: string;
  readonly checkpoint?: string;
}

export interface PlatformAgentMemory {
  readonly id: string;
  readonly agentId: string;
  readonly content: string;
  readonly type: PlatformAgentMemoryType;
  readonly createdAt: number;
  readonly accessCount: number;
}

export interface PlatformAgentState {
  readonly schema: 1;
  readonly agents: readonly PlatformAgentRecord[];
  readonly memories: readonly PlatformAgentMemory[];
}

export interface PlatformBuiltinAgent {
  readonly name: string;
  readonly description: string;
  readonly systemPrompt: string;
  readonly tools: readonly string[] | '*';
  readonly maxTurns: number;
}

const MAX_ITEMS = 500;
const STATUSES: readonly PlatformAgentStatus[] = ['pending', 'running', 'completed', 'failed', 'paused', 'cancelled'];
const MEMORY_TYPES: readonly PlatformAgentMemoryType[] = ['context', 'result', 'intermediate', 'summary'];

export const PLATFORM_BUILTIN_AGENTS: readonly PlatformBuiltinAgent[] = [
  { name: 'code-reviewer', description: 'Code review, bug detection, and quality analysis', systemPrompt: 'Review code thoroughly for bugs, security issues, tests, complexity, and maintainability. Cite concrete files and lines.', tools: ['read_file', 'glob', 'grep', 'edit_file'], maxTurns: 30 },
  { name: 'researcher', description: 'Web research, evidence gathering, and synthesis', systemPrompt: 'Research the question, compare reliable sources, identify gaps, and provide a concise sourced synthesis.', tools: ['web_search', 'web_fetch', 'memory_search'], maxTurns: 40 },
  { name: 'tester', description: 'Test design and implementation', systemPrompt: 'Write and run focused tests, cover edge cases, and explain failures clearly.', tools: ['read_file', 'glob', 'write_file', 'edit_file'], maxTurns: 50 },
  { name: 'architect', description: 'System design and architecture decisions', systemPrompt: 'Design maintainable systems, explain trade-offs, scalability, performance, and technical debt.', tools: ['read_file', 'glob', 'grep', 'write_file'], maxTurns: 20 },
  { name: 'debugger', description: 'Root-cause diagnosis and verification', systemPrompt: 'Reproduce issues, isolate root causes, propose minimal fixes, and verify the result systematically.', tools: ['read_file', 'grep', 'bash'], maxTurns: 30 },
  { name: 'refactorer', description: 'Safe code structure and quality improvements', systemPrompt: 'Make small compatible refactors, reduce duplication, improve names, and verify behavior.', tools: ['read_file', 'glob', 'grep', 'edit_file', 'write_file'], maxTurns: 50 },
];

function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function stringValue(value: unknown): value is string { return typeof value === 'string'; }
function integer(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }

export function createInitialPlatformAgentState(): PlatformAgentState { return { schema: 1, agents: [], memories: [] }; }

export function parsePlatformAgentState(value: unknown): PlatformAgentState {
  if (!record(value) || value.schema !== 1) return createInitialPlatformAgentState();
  const agents = Array.isArray(value.agents) ? value.agents.filter(record).filter((agent) => stringValue(agent.id) && stringValue(agent.name) && stringValue(agent.role) && stringValue(agent.prompt) && (agent.tools === '*' || (Array.isArray(agent.tools) && agent.tools.every(stringValue))) && STATUSES.includes(agent.status as PlatformAgentStatus) && integer(agent.createdAt) && integer(agent.updatedAt) && (agent.model === undefined || stringValue(agent.model)) && (agent.output === undefined || stringValue(agent.output)) && (agent.error === undefined || stringValue(agent.error)) && (agent.sessionId === undefined || stringValue(agent.sessionId)) && (agent.checkpoint === undefined || stringValue(agent.checkpoint))).slice(-MAX_ITEMS) as unknown as PlatformAgentRecord[] : [];
  const memories = Array.isArray(value.memories) ? value.memories.filter(record).filter((memory) => stringValue(memory.id) && stringValue(memory.agentId) && stringValue(memory.content) && MEMORY_TYPES.includes(memory.type as PlatformAgentMemoryType) && integer(memory.createdAt) && integer(memory.accessCount)).slice(-MAX_ITEMS) as unknown as PlatformAgentMemory[] : [];
  return { schema: 1, agents, memories };
}

export function createPlatformAgent(state: PlatformAgentState, input: Omit<PlatformAgentRecord, 'status' | 'updatedAt'>, now = Date.now()): PlatformAgentState {
  const agent: PlatformAgentRecord = { ...input, status: 'pending', updatedAt: now };
  return { ...state, agents: [...state.agents, agent].slice(-MAX_ITEMS) };
}

export function updatePlatformAgent(state: PlatformAgentState, id: string, patch: Partial<Pick<PlatformAgentRecord, 'status' | 'output' | 'error' | 'sessionId' | 'checkpoint' | 'prompt'>>, now = Date.now()): PlatformAgentState {
  return { ...state, agents: state.agents.map((agent) => agent.id === id ? { ...agent, ...patch, updatedAt: now } : agent) };
}

export function getPlatformAgent(state: PlatformAgentState, id: string): PlatformAgentRecord | undefined { return state.agents.find((agent) => agent.id === id); }
export function listPlatformAgents(state: PlatformAgentState): readonly PlatformAgentRecord[] { return [...state.agents].sort((left, right) => right.updatedAt - left.updatedAt); }

export function addPlatformAgentMemory(state: PlatformAgentState, memory: Omit<PlatformAgentMemory, 'accessCount'>): PlatformAgentState {
  return { ...state, memories: [...state.memories, { ...memory, accessCount: 0 }].slice(-MAX_ITEMS) };
}

export function getPlatformAgentMemory(state: PlatformAgentState, id: string): { state: PlatformAgentState; memory?: PlatformAgentMemory } {
  const memory = state.memories.find((item) => item.id === id);
  if (!memory) return { state };
  const updated = { ...memory, accessCount: memory.accessCount + 1 };
  return { state: { ...state, memories: state.memories.map((item) => item.id === id ? updated : item) }, memory: updated };
}

export function listPlatformAgentMemories(state: PlatformAgentState, agentId: string): readonly PlatformAgentMemory[] { return state.memories.filter((memory) => memory.agentId === agentId).sort((left, right) => right.createdAt - left.createdAt); }
export function clearPlatformAgentMemories(state: PlatformAgentState, agentId: string): PlatformAgentState { return { ...state, memories: state.memories.filter((memory) => memory.agentId !== agentId) }; }
