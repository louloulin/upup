/**
 * Test the agent-port registry contract: implementations register on import,
 * consumers read via the typed accessor.
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import {
  registerPlanModePort,
  getPlanModePort,
  registerAgentConfigPort,
  getAgentConfigPort,
  __resetAgentPorts,
} from './agent-port.js';

// Importing plan-mode-state triggers self-registration via the side effect
// at the bottom of that module. All tests below observe the registered port.
import './plan-mode-state.js';
import { getPlanModeState, resetPlanModeState } from './plan-mode-state.js';

describe('agent-port registry (with plan-mode-state registered)', () => {
  beforeEach(() => {
    // Reset plan-mode singleton state but keep the registered port.
    resetPlanModeState();
    // Force re-creation of the singleton so the registered port reads
    // fresh state.
    getPlanModeState();
  });

  test('plan-mode-state.ts self-registers on import', () => {
    const port = getPlanModePort();
    expect(port).not.toBeNull();
    expect(port?.isActive()).toBe(false);
  });

  test('plan-mode-state.ts port reflects state changes', () => {
    const port = getPlanModePort()!;
    expect(port.isActive()).toBe(false);
    port.enter('test-plan-123');
    expect(port.isActive()).toBe(true);
    expect(port.getPlanId()).toBe('test-plan-123');
    port.exit();
    expect(port.isActive()).toBe(false);
    expect(port.getPlanId()).toBeUndefined();
  });

  test('registerPlanModePort overwrites existing port', () => {
    const custom = {
      isActive: () => true,
      getPlanId: () => 'custom-id',
      enter: () => {},
      exit: () => {},
    };
    registerPlanModePort(custom);
    expect(getPlanModePort()).toBe(custom);
  });

  test('agent config port registration', () => {
    expect(getAgentConfigPort()).toBeNull();
    registerAgentConfigPort({ getModel: () => 'gpt-5.4', getProvider: () => 'openai' });
    const port = getAgentConfigPort();
    expect(port?.getModel()).toBe('gpt-5.4');
    expect(port?.getProvider()).toBe('openai');
  });
});

describe('agent-port registry (after __resetAgentPorts)', () => {
  beforeEach(() => {
    __resetAgentPorts();
  });

  test('getPlanModePort returns null when no impl is registered', () => {
    // Note: this test only proves the registry cleanup works. The real
    // production wiring still happens via plan-mode-state.ts self-registration.
    const port = getPlanModePort();
    expect(port).toBeNull();
  });
});
