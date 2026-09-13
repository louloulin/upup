export type PlatformMessageType = 'task' | 'status' | 'request' | 'response' | 'broadcast';

export interface PlatformAgentMessage {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly type: PlatformMessageType;
  readonly content: string;
  readonly timestamp: number;
  readonly taskId?: string;
  readonly read: boolean;
}

export interface PlatformMessageState {
  readonly schema: 1;
  readonly messages: readonly PlatformAgentMessage[];
}

export interface PlatformMessageInput {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly type: PlatformMessageType;
  readonly content: string;
  readonly timestamp: number;
  readonly taskId?: string;
}

const MAX_MESSAGES = 1_000;
const MESSAGE_TYPES: readonly PlatformMessageType[] = ['task', 'status', 'request', 'response', 'broadcast'];

function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown): value is string { return typeof value === 'string'; }
function timestamp(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }

export function createInitialPlatformMessageState(): PlatformMessageState { return { schema: 1, messages: [] }; }

export function parsePlatformMessageState(value: unknown): PlatformMessageState {
  if (!record(value) || value.schema !== 1 || !Array.isArray(value.messages)) return createInitialPlatformMessageState();
  const messages = value.messages.filter(record).filter((message) =>
    text(message.id) && text(message.from) && text(message.to) && text(message.content) && timestamp(message.timestamp) &&
    MESSAGE_TYPES.includes(message.type as PlatformMessageType) && typeof message.read === 'boolean' &&
    (message.taskId === undefined || text(message.taskId)),
  ).slice(-MAX_MESSAGES) as unknown as PlatformAgentMessage[];
  return { schema: 1, messages };
}

export function appendPlatformMessage(state: PlatformMessageState, input: PlatformMessageInput): PlatformMessageState {
  if (!input.id || !input.from || !input.to || !input.content || !MESSAGE_TYPES.includes(input.type)) return state;
  const message: PlatformAgentMessage = { ...input, read: false };
  return { schema: 1, messages: [...state.messages, message].slice(-MAX_MESSAGES) };
}

export function listPlatformMessages(state: PlatformMessageState, filter?: { readonly to?: string; readonly from?: string; readonly unread?: boolean; readonly limit?: number }): readonly PlatformAgentMessage[] {
  const messages = state.messages.filter((message) =>
    (!filter?.to || message.to === filter.to || message.to === 'all') &&
    (!filter?.from || message.from === filter.from) &&
    (!filter?.unread || !message.read),
  ).sort((left, right) => right.timestamp - left.timestamp);
  return messages.slice(0, Math.min(filter?.limit ?? MAX_MESSAGES, MAX_MESSAGES));
}
