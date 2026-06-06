/**
 * v7-2b: extended port registry tests.
 *
 * Isolated from agent-port.test.ts because the PlanModePort tests use
 * beforeEach(__resetAgentPorts), which would clear the registry and break
 * our auto-registration checks. By using a separate file, the registry
 * stays clean for these tests.
 */

import { describe, test, expect } from 'bun:test';
import { getSubagentPort, getMcpRegistryPort, getStatePort } from './agent-port.js';
import './subagent-runner.js';
import '@upup/mcp/registry';
import '@upup/state';

describe('v7-2b: extended port registry', () => {
  test('subagent-runner self-registers SubagentPort on import', () => {
    const port = getSubagentPort();
    expect(port).not.toBeNull();
    expect(typeof port!.createTask).toBe('function');
    expect(typeof port!.getAllTasks).toBe('function');
  });

  test('SubagentPort.getAllTasks returns an array of summaries', () => {
    const port = getSubagentPort()!;
    const tasks = port.getAllTasks();
    expect(Array.isArray(tasks)).toBe(true);
    for (const t of tasks) {
      expect(typeof t.id).toBe('string');
      expect(typeof t.status).toBe('string');
      expect(typeof t.prompt).toBe('string');
    }
  });

  test('mcp/registry self-registers McpRegistryPort on import', () => {
    const port = getMcpRegistryPort();
    expect(port).not.toBeNull();
    const status = port!.getStatus();
    expect(typeof status.totalServers).toBe('number');
    expect(typeof status.connectedServers).toBe('number');
    expect(typeof status.totalTools).toBe('number');
    expect(Array.isArray(status.servers)).toBe(true);
  });

  test('state/index self-registers StatePort on import', () => {
    const port = getStatePort();
    expect(port).not.toBeNull();
    expect(typeof port!.formatCost).toBe('function');
    expect(typeof port!.formatTokens).toBe('function');
    expect(typeof port!.getAppState).toBe('function');
    expect(typeof port!.getSessionManager).toBe('function');
  });

  test('StatePort.formatCost/formatTokens are pure (callable without side effects)', () => {
    const port = getStatePort()!;
    const cost = port.formatCost(1.5);
    expect(typeof cost).toBe('string');
    expect(cost.length).toBeGreaterThan(0);
    const tokens = port.formatTokens(1234);
    expect(typeof tokens).toBe('string');
    expect(tokens.length).toBeGreaterThan(0);
  });
});
