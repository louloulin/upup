export type KairosEventKind = 'opportunity' | 'position-alert' | 'scanner' | 'realtime';

export interface NativeKairosEvent {
  topic: string;
  kind: KairosEventKind;
  payload: unknown;
  timestamp: number;
  seq: number;
}

export interface NativeKairosJournalState {
  schema: 1;
  nextSeq: number;
  events: readonly NativeKairosEvent[];
}

export const createInitialKairosJournalState = (): NativeKairosJournalState => ({ schema: 1, nextSeq: 1, events: [] });

const kindTopics: Record<KairosEventKind, readonly string[]> = {
  opportunity: ['kairos.opportunity.'],
  'position-alert': ['kairos.position.alert'],
  scanner: ['kairos.scanner.'],
  realtime: ['realtime.quote', 'realtime.bar'],
};

function clonePayload(payload: unknown): unknown {
  if (payload === undefined) return undefined;
  return JSON.parse(JSON.stringify(payload)) as unknown;
}

function cloneEvent(event: NativeKairosEvent): NativeKairosEvent {
  return { ...event, payload: clonePayload(event.payload) };
}

export function classifyKairosTopic(topic: string): KairosEventKind | undefined {
  return (Object.entries(kindTopics) as [KairosEventKind, readonly string[]][]).find(([, prefixes]) => prefixes.some((prefix) => topic === prefix || topic.startsWith(prefix)))?.[0];
}

export function appendKairosEvent(state: NativeKairosJournalState, input: { topic: string; payload: unknown; timestamp?: number }): NativeKairosJournalState {
  const kind = classifyKairosTopic(input.topic);
  if (!kind) return state;
  if (input.topic.length > 128) throw new Error('Kairos topic is too long');
  const event: NativeKairosEvent = { topic: input.topic, kind, payload: clonePayload(input.payload), timestamp: Number.isFinite(input.timestamp) ? Number(input.timestamp) : Date.now(), seq: state.nextSeq };
  const events = [...state.events, event].slice(-1000);
  return { schema: 1, nextSeq: state.nextSeq + 1, events };
}

export function listKairosEvents(state: NativeKairosJournalState, kind: KairosEventKind, limit: number): NativeKairosEvent[] {
  if (!Number.isInteger(limit) || limit < 0 || limit > 200) throw new Error('limit must be an integer from 0 to 200');
  return state.events.filter((event) => event.kind === kind).slice(-limit).map(cloneEvent);
}

export function summarizeKairos(state: NativeKairosJournalState, recentsPerKind: number): Record<KairosEventKind, { count: number; recent: NativeKairosEvent[] }> {
  if (!Number.isInteger(recentsPerKind) || recentsPerKind < 0 || recentsPerKind > 10) throw new Error('recentsPerKind must be an integer from 0 to 10');
  return (Object.keys(kindTopics) as KairosEventKind[]).reduce((summary, kind) => {
    const events = listKairosEvents(state, kind, 200);
    summary[kind] = { count: events.length, recent: events.slice(-recentsPerKind) };
    return summary;
  }, {} as Record<KairosEventKind, { count: number; recent: NativeKairosEvent[] }>);
}
