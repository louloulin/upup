import { describe, expect, test } from 'bun:test';
import {
  PROTOCOL_VERSION,
  decodeMessage,
  encodeMessage,
  signMessage,
  verifyMessage,
  type BridgeMessage,
} from './protocol.js';

const secret = 'test-secret-32-bytes-of-padded!!';

function makeChat(): BridgeMessage {
  return {
    kind: 'chat',
    seq: 1,
    sessionId: 'sess-1',
    timestamp: 1717480800000,
    payload: { role: 'user', content: 'analyze 600519' },
  };
}

describe('protocol', () => {
  test('PROTOCOL_VERSION is bridge.v1', () => {
    expect(PROTOCOL_VERSION).toBe('bridge.v1');
  });

  test('encode then decode round-trips chat message', () => {
    const msg = makeChat();
    const frame = encodeMessage(msg);
    const decoded = decodeMessage(frame);
    expect(decoded).toEqual(msg);
  });

  test('decode rejects malformed frame', () => {
    expect(() => decodeMessage(new Uint8Array([0, 1, 2]))).toThrow();
    expect(() => decodeMessage(new TextEncoder().encode('not json'))).toThrow();
  });

  test('sign + verify round-trip succeeds', () => {
    const msg = makeChat();
    const sig = signMessage(msg, secret);
    expect(sig).toMatch(/^bridge\.v1\.hmac-sha256\.[a-f0-9]{64}$/);
    expect(verifyMessage(msg, sig, secret)).toBe(true);
  });

  test('verify fails with wrong secret', () => {
    const msg = makeChat();
    const sig = signMessage(msg, secret);
    expect(verifyMessage(msg, sig, 'wrong-secret')).toBe(false);
  });

  test('verify fails with tampered message', () => {
    const msg = makeChat();
    const sig = signMessage(msg, secret);
    const tampered: BridgeMessage = { ...msg, payload: { role: 'user', content: 'hacked' } };
    expect(verifyMessage(tampered, sig, secret)).toBe(false);
  });

  test('all 4 message kinds encode/decode', () => {
    const kinds: BridgeMessage[] = [
      { kind: 'chat', seq: 1, sessionId: 's', timestamp: 0, payload: { role: 'user', content: 'x' } },
      { kind: 'approval', seq: 2, sessionId: 's', timestamp: 0, payload: { tool: 'bash', args: { cmd: 'ls' }, approved: true } },
      { kind: 'output', seq: 3, sessionId: 's', timestamp: 0, payload: { tool: 'bash', result: 'file.txt', latencyMs: 12 } },
      { kind: 'status', seq: 4, sessionId: 's', timestamp: 0, payload: { phase: 'idle' } },
    ];
    for (const m of kinds) {
      const round = decodeMessage(encodeMessage(m));
      expect(round).toEqual(m);
    }
  });
});
