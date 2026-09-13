export type ResearchPhase = 'research' | 'synthesis' | 'implementation' | 'verification';
export type ResearchTaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked';

export interface NativeResearchTask {
  readonly id: string;
  readonly title: string;
  readonly phase: ResearchPhase;
  readonly status: ResearchTaskStatus;
  readonly assignee?: string;
  readonly notes?: string;
  readonly artifacts?: readonly string[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface NativeResearchJournalState {
  readonly schema: 1;
  readonly tasks: readonly NativeResearchTask[];
}

export interface ResearchJournalQuery {
  readonly phase?: ResearchPhase;
  readonly status?: ResearchTaskStatus;
  readonly limit?: number;
}

const PHASES: readonly ResearchPhase[] = ['research', 'synthesis', 'implementation', 'verification'];
const STATUSES: readonly ResearchTaskStatus[] = ['pending', 'in_progress', 'completed', 'failed', 'blocked'];
const MAX_TASKS = 1_000;

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function isString(value: unknown): value is string { return typeof value === 'string'; }
function isFiniteInteger(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value); }

function parseTask(value: unknown): NativeResearchTask | undefined {
  if (!isRecord(value) || !isString(value.id) || !isString(value.title) || !PHASES.includes(value.phase as ResearchPhase) || !STATUSES.includes(value.status as ResearchTaskStatus) || !isFiniteInteger(value.createdAt) || !isFiniteInteger(value.updatedAt)) return undefined;
  const task: NativeResearchTask = {
    id: value.id.slice(0, 200), title: value.title.slice(0, 500), phase: value.phase as ResearchPhase, status: value.status as ResearchTaskStatus,
    createdAt: value.createdAt, updatedAt: value.updatedAt,
    ...(isString(value.assignee) ? { assignee: value.assignee.slice(0, 100) } : {}),
    ...(isString(value.notes) ? { notes: value.notes.slice(0, 4_000) } : {}),
    ...(Array.isArray(value.artifacts) ? { artifacts: value.artifacts.filter(isString).slice(0, 50).map((artifact) => artifact.slice(0, 500)) } : {}),
  };
  return task;
}

export function createInitialResearchJournalState(): NativeResearchJournalState { return { schema: 1, tasks: [] }; }

export function parseResearchJournalState(value: unknown): NativeResearchJournalState {
  if (!isRecord(value) || value.schema !== 1 || !Array.isArray(value.tasks)) return createInitialResearchJournalState();
  return { schema: 1, tasks: value.tasks.map(parseTask).filter((task): task is NativeResearchTask => Boolean(task)).slice(-MAX_TASKS) };
}

export function queryResearchJournal(state: NativeResearchJournalState, query: ResearchJournalQuery = {}): NativeResearchJournalState {
  const limit = query.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_TASKS) throw new Error('limit must be an integer between 1 and 1000');
  if (query.phase && !PHASES.includes(query.phase)) throw new Error('phase is invalid');
  if (query.status && !STATUSES.includes(query.status)) throw new Error('status is invalid');
  const tasks = state.tasks.filter((task) => (!query.phase || task.phase === query.phase) && (!query.status || task.status === query.status)).slice(-limit);
  return { schema: 1, tasks: tasks.map((task) => ({ ...task, ...(task.artifacts ? { artifacts: [...task.artifacts] } : {}) })) };
}
