import { describe, test, expect, beforeEach } from 'bun:test';
import { useCanUseTool, ToolPermissionGate } from './agent-hooks.js';

describe('useCanUseTool', () => {
  let gate: ToolPermissionGate;

  beforeEach(() => {
    // Create fresh instance for each test
    gate = new ToolPermissionGate();
  });

  test('allows tools by default', () => {
    const result = gate.check('read_file');
    expect(result.allowed).toBe(true);
    expect(result.permission).toBe('allowed');
  });

  test('denies tool when rule is set to denied', () => {
    gate.setRule({ tool: 'write_file', permission: 'denied', reason: 'readonly session' });
    const result = gate.check('write_file');
    expect(result.allowed).toBe(false);
    expect(result.permission).toBe('denied');
    expect(result.reason).toBe('readonly session');
  });

  test('requires-approval does not auto-allow', () => {
    gate.setRule({ tool: 'edit_file', permission: 'requires-approval' });
    const result = gate.check('edit_file');
    expect(result.allowed).toBe(false);
    expect(result.permission).toBe('requires-approval');
  });

  test('allows tool when rule is set to allowed', () => {
    gate.setRule({ tool: 'read_file', permission: 'allowed' });
    const result = gate.check('read_file');
    expect(result.allowed).toBe(true);
  });

  test('recordDenial blocks subsequent calls', () => {
    gate.recordDenial('bash', 'user denied', 60000);
    const result = gate.check('bash');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('user denied');
  });

  test('recordDenial with TTL expires', () => {
    gate.recordDenial('bash', 'temporary', 1); // 1ms TTL
    // Wait for TTL to expire
    const start = Date.now();
    while (Date.now() - start < 5) { /* busy wait */ }
    const result = gate.check('bash');
    expect(result.allowed).toBe(true);
  });

  test('recordDenial without TTL persists', () => {
    gate.recordDenial('bash', 'permanent');
    const result = gate.check('bash');
    expect(result.allowed).toBe(false);
  });

  test('clearDenial allows tool again', () => {
    gate.recordDenial('bash', 'denied');
    gate.clearDenial('bash');
    const result = gate.check('bash');
    expect(result.allowed).toBe(true);
  });

  test('removeRule removes the rule', () => {
    gate.setRule({ tool: 'write_file', permission: 'denied' });
    expect(gate.check('write_file').allowed).toBe(false);
    gate.removeRule('write_file');
    expect(gate.check('write_file').allowed).toBe(true);
  });

  test('deny pattern blocks matching tools', () => {
    gate.addDenyPattern(/^exec_/);
    expect(gate.check('exec_shell').allowed).toBe(false);
    expect(gate.check('read_file').allowed).toBe(true);
  });

  test('clearDenyPatterns removes all patterns', () => {
    gate.addDenyPattern(/^exec_/);
    gate.clearDenyPatterns();
    expect(gate.check('exec_shell').allowed).toBe(true);
  });

  test('setEnabled(false) bypasses all checks', () => {
    gate.setRule({ tool: 'write_file', permission: 'denied' });
    gate.recordDenial('bash', 'denied');
    gate.setEnabled(false);
    expect(gate.check('write_file').allowed).toBe(true);
    expect(gate.check('bash').allowed).toBe(true);
  });

  test('setEnabled(true) restores checks', () => {
    gate.setRule({ tool: 'write_file', permission: 'denied' });
    gate.setEnabled(false);
    gate.setEnabled(true);
    expect(gate.check('write_file').allowed).toBe(false);
  });

  test('getRules returns all rules', () => {
    gate.setRule({ tool: 'a', permission: 'denied' });
    gate.setRule({ tool: 'b', permission: 'allowed' });
    expect(gate.getRules()).toHaveLength(2);
  });

  test('getDenials returns all denials', () => {
    gate.recordDenial('a', 'reason1');
    gate.recordDenial('b', 'reason2');
    expect(gate.getDenials().size).toBe(2);
  });

  test('reset clears everything', () => {
    gate.setRule({ tool: 'a', permission: 'denied' });
    gate.recordDenial('b', 'reason');
    gate.addDenyPattern(/test/);
    gate.reset();
    expect(gate.getRules()).toHaveLength(0);
    expect(gate.getDenials().size).toBe(0);
    expect(gate.check('a').allowed).toBe(true);
    expect(gate.check('b').allowed).toBe(true);
    expect(gate.check('test_tool').allowed).toBe(true);
  });

  test('rule with expiresAt expires over time', () => {
    gate.setRule({ tool: 'temp_tool', permission: 'denied', expiresAt: Date.now() + 1 });
    expect(gate.check('temp_tool').allowed).toBe(false);
    // Wait for expiry
    const start = Date.now();
    while (Date.now() - start < 5) { /* busy wait */ }
    expect(gate.check('temp_tool').allowed).toBe(true);
  });

  test('singleton useCanUseTool returns same instance', () => {
    const a = useCanUseTool();
    const b = useCanUseTool();
    expect(a).toBe(b);
  });
});
