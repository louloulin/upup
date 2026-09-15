import { describe, expect, test } from 'bun:test';
import { JsonRpcErrorCode, JsonRpcMethod } from './src/index';

describe('@upup/pi-stdio', () => {
  test('exposes the stable JSON-RPC protocol contract', () => {
    expect(JsonRpcMethod.Initialize).toBe('initialize');
    expect(JsonRpcMethod.SessionResume).toBe('session/resume');
    expect(JsonRpcErrorCode.InvalidRequest).toBe(-32600);
  });
});
