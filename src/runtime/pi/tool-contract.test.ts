import { describe, expect, test } from 'bun:test';
import { READ_ONLY_PERMISSION_PROFILE } from './agent-spec.js';
import { canUseTool, createToolContext, defaultToolParameters, requiresApproval } from './tool-contract.js';

describe('Pi tool contracts', () => {
  test('enforces read-only financial policy', () => {
    expect(canUseTool(READ_ONLY_PERMISSION_PROFILE, 'safe')).toBe(true);
    expect(canUseTool(READ_ONLY_PERMISSION_PROFILE, 'dangerous')).toBe(false);
    expect(requiresApproval(READ_ONLY_PERMISSION_PROFILE, 'warning')).toBe(false);
  });

  test('creates an auditable tool context', () => {
    const context = createToolContext({ id: 'test', version: '1.0.0' } as never, 'call-1', new AbortController().signal);
    expect(context.toolCallId).toBe('call-1');
    expect(context.auditId).toMatch(/^[0-9a-f-]{36}$/);
    expect(defaultToolParameters()).toBeTruthy();
  });
});
