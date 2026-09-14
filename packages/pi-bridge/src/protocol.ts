import { createHmac, timingSafeEqual } from 'node:crypto';

export const PROTOCOL_VERSION = 'bridge.v1' as const;

export type BridgeMessage =
  | { kind: 'chat'; seq: number; sessionId: string; timestamp: number; payload: { role: 'user' | 'assistant'; content: string } }
  | { kind: 'approval'; seq: number; sessionId: string; timestamp: number; payload: { tool: string; args: unknown; approved: boolean } }
  | { kind: 'output'; seq: number; sessionId: string; timestamp: number; payload: { tool: string; result: string; latencyMs: number } }
  | { kind: 'status'; seq: number; sessionId: string; timestamp: number; payload: { phase: 'idle' | 'thinking' | 'tool' | 'done'; progress?: number } };

export function encodeMessage(msg: BridgeMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ v: PROTOCOL_VERSION, msg }));
}

export function decodeMessage(frame: Uint8Array): BridgeMessage {
  let text: string;
  try {
    text = new TextDecoder().decode(frame);
  } catch {
    throw new Error('bridge.protocol: invalid utf-8');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('bridge.protocol: invalid json');
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (parsed as { v?: unknown }).v !== PROTOCOL_VERSION ||
    !(parsed as { msg?: unknown }).msg ||
    typeof (parsed as { msg: unknown }).msg !== 'object'
  ) {
    throw new Error('bridge.protocol: bad envelope');
  }
  const msg = (parsed as { msg: BridgeMessage }).msg;
  if (!isBridgeMessage(msg)) {
    throw new Error('bridge.protocol: unknown message shape');
  }
  return msg;
}

function isBridgeMessage(v: unknown): v is BridgeMessage {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  if (typeof m['seq'] !== 'number') return false;
  if (typeof m['sessionId'] !== 'string') return false;
  if (typeof m['timestamp'] !== 'number') return false;
  switch (m['kind']) {
    case 'chat': {
      const p = m['payload'] as { role?: unknown; content?: unknown };
      return (p.role === 'user' || p.role === 'assistant') && typeof p.content === 'string';
    }
    case 'approval': {
      const p = m['payload'] as { tool?: unknown; args?: unknown; approved?: unknown };
      return typeof p.tool === 'string' && typeof p.approved === 'boolean';
    }
    case 'output': {
      const p = m['payload'] as { tool?: unknown; result?: unknown; latencyMs?: unknown };
      return typeof p.tool === 'string' && typeof p.result === 'string' && typeof p.latencyMs === 'number';
    }
    case 'status': {
      const p = m['payload'] as { phase?: unknown };
      return p.phase === 'idle' || p.phase === 'thinking' || p.phase === 'tool' || p.phase === 'done';
    }
    default:
      return false;
  }
}

const SIGN_PREFIX = 'bridge.v1.hmac-sha256.';

export function signMessage(msg: BridgeMessage, secret: string): string {
  const body = JSON.stringify(msg);
  const mac = createHmac('sha256', secret).update(body).digest('hex');
  return SIGN_PREFIX + mac;
}

export function verifyMessage(msg: BridgeMessage, sig: string, secret: string): boolean {
  if (!sig.startsWith(SIGN_PREFIX)) return false;
  const provided = sig.slice(SIGN_PREFIX.length);
  const body = JSON.stringify(msg);
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}
