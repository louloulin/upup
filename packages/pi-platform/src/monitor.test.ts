import { describe, expect, test } from 'bun:test';
import { platformMonitor } from './monitor.js';

describe('pi-platform monitor', () => {
  test('reports each supported metric', () => {
    expect(platformMonitor('cpu')).toContain('CPU:');
    expect(platformMonitor('memory')).toContain('Memory');
    expect(platformMonitor('uptime')).toContain('System Uptime:');
    expect(platformMonitor()).toContain('=== System Monitor ===');
  });

  test('rejects unsupported metrics', () => {
    expect(() => platformMonitor('invalid' as never)).toThrow('unsupported monitor metric');
  });
});
