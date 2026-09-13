export type PlatformAskKind = 'confirm' | 'select' | 'multi_select' | 'input';

export interface PlatformAskResponse {
  readonly requestId: string;
  readonly question: string;
  readonly kind: PlatformAskKind;
  readonly value?: string | readonly string[];
  readonly skipped: boolean;
  readonly timestamp: number;
}

export interface PlatformAskState {
  readonly schema: 1;
  readonly responses: readonly PlatformAskResponse[];
}

const MAX_RESPONSES = 500;

export function createInitialPlatformAskState(): PlatformAskState { return { schema: 1, responses: [] }; }

export function parsePlatformAskState(value: unknown): PlatformAskState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return createInitialPlatformAskState();
  const candidate = value as { schema?: unknown; responses?: unknown };
  if (candidate.schema !== 1 || !Array.isArray(candidate.responses)) return createInitialPlatformAskState();
  const responses = candidate.responses.filter((response): response is PlatformAskResponse => {
    if (!response || typeof response !== 'object' || Array.isArray(response)) return false;
    const item = response as Record<string, unknown>;
    const valueValid = item.value === undefined || typeof item.value === 'string' || (Array.isArray(item.value) && item.value.every((entry) => typeof entry === 'string'));
    return typeof item.requestId === 'string' && item.requestId.length > 0 && typeof item.question === 'string' && ['confirm', 'select', 'multi_select', 'input'].includes(String(item.kind)) && valueValid && typeof item.skipped === 'boolean' && typeof item.timestamp === 'number' && Number.isSafeInteger(item.timestamp);
  }).slice(-MAX_RESPONSES);
  return { schema: 1, responses };
}

export function appendPlatformAskResponse(state: PlatformAskState, response: PlatformAskResponse): PlatformAskState {
  return { schema: 1, responses: [...state.responses.filter((item) => item.requestId !== response.requestId), response].slice(-MAX_RESPONSES) };
}

export function getPlatformAskResponse(state: PlatformAskState, requestId: string): PlatformAskResponse | undefined {
  return state.responses.find((response) => response.requestId === requestId);
}
