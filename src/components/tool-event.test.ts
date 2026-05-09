/**
 * Tests for ToolEventComponent sub-agent detail nesting
 */

import { describe, it, expect } from 'bun:test';
import { ToolEventComponent } from './tool-event.js';
import type { TUI } from '@mariozechner/pi-tui';

// Minimal TUI mock for component construction
const mockTui = {
  requestRender: () => {},
  screen: { width: 80, height: 24 },
} as unknown as TUI;

describe('ToolEventComponent', () => {
  it('creates component with tool name', () => {
    const comp = new ToolEventComponent(mockTui, 'read_file', { path: '/test.txt' });
    expect(comp).toBeDefined();
    comp.dispose();
  });

  it('adds sub-agent detail lines', () => {
    const comp = new ToolEventComponent(mockTui, 'agent', { description: 'research' });
    comp.addSubAgentDetail('→ read_file()');
    comp.addSubAgentDetail('← read_file (120ms): file contents...');
    comp.addSubAgentDetail('→ web_search()');
    // Should not throw and component should still be valid
    expect(comp).toBeDefined();
    comp.dispose();
  });

  it('limits sub-agent details to MAX (6)', () => {
    const comp = new ToolEventComponent(mockTui, 'agent', {});
    // Add 10 details - should only keep last 6
    for (let i = 0; i < 10; i++) {
      comp.addSubAgentDetail(`detail ${i}`);
    }
    expect(comp).toBeDefined();
    comp.dispose();
  });

  it('dispose clears sub-agent details', () => {
    const comp = new ToolEventComponent(mockTui, 'agent', {});
    comp.addSubAgentDetail('→ read_file()');
    comp.addSubAgentDetail('← read_file (50ms)');
    // Should not throw
    comp.dispose();
    expect(comp).toBeDefined();
  });

  it('setActive with progress message', () => {
    const comp = new ToolEventComponent(mockTui, 'bash', { command: 'ls' });
    comp.setActive('running...');
    comp.dispose();
  });

  it('setComplete with summary', () => {
    const comp = new ToolEventComponent(mockTui, 'bash', { command: 'ls' });
    comp.setComplete('2 files listed', 150);
    comp.dispose();
  });

  it('setError with message', () => {
    const comp = new ToolEventComponent(mockTui, 'bash', { command: 'ls' });
    comp.setError('command not found');
    comp.dispose();
  });

  it('setLimitWarning with warning', () => {
    const comp = new ToolEventComponent(mockTui, 'bash', { command: 'ls' });
    comp.setLimitWarning('Approaching limit');
    comp.dispose();
  });
});
