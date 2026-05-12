/**
 * Session codec for cross-heartbeat session persistence.
 */

import type { AdapterSessionCodec } from '@paperclipai/adapter-utils';

export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw: unknown) {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    // sessionId can be string or number - check both
    if (!obj.sessionId && obj.sessionId !== 0) return null;
    // Convert numeric sessionId to string for consistency
    if (typeof obj.sessionId === 'number') {
      return { ...obj, sessionId: String(obj.sessionId) };
    }
    return obj;
  },

  serialize(params: Record<string, unknown> | null) {
    return params ?? {};
  },

  getDisplayId(params: Record<string, unknown> | null): string | null {
    if (!params) return null;
    const id = params.sessionId;
    if (id === undefined || id === null) return null;
    // Handle both string and number
    const strId: string = typeof id === 'number' ? String(id) : (id as string);
    return strId.slice(0, 16);
  },
};
