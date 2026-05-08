/**
 * Tests for MonitorTool
 */

import { describe, it, expect } from 'vitest';
import os from 'os';
import {
  MonitorToolSchema,
  MONITOR_TOOL_DESCRIPTION,
  createMonitorTool,
} from './monitor-tool.js';

describe('MonitorToolSchema', () => {
  it('should parse valid input with all metric', () => {
    const result = MonitorToolSchema.safeParse({ metric: 'all' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metric).toBe('all');
    }
  });

  it('should parse valid input with cpu metric', () => {
    const result = MonitorToolSchema.safeParse({ metric: 'cpu' });
    expect(result.success).toBe(true);
  });

  it('should parse valid input with memory metric', () => {
    const result = MonitorToolSchema.safeParse({ metric: 'memory' });
    expect(result.success).toBe(true);
  });

  it('should parse valid input with uptime metric', () => {
    const result = MonitorToolSchema.safeParse({ metric: 'uptime' });
    expect(result.success).toBe(true);
  });

  it('should default to all when no metric provided', () => {
    const result = MonitorToolSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metric).toBe('all');
    }
  });

  it('should reject invalid metric', () => {
    const result = MonitorToolSchema.safeParse({ metric: 'disk' });
    expect(result.success).toBe(false);
  });

  it('should reject non-string metric', () => {
    const result = MonitorToolSchema.safeParse({ metric: 123 });
    expect(result.success).toBe(false);
  });
});

describe('MONITOR_TOOL_DESCRIPTION', () => {
  it('should have non-empty description', () => {
    expect(MONITOR_TOOL_DESCRIPTION.length).toBeGreaterThan(10);
  });

  it('should mention system metrics', () => {
    expect(MONITOR_TOOL_DESCRIPTION).toMatch(/cpu|memory|uptime/i);
  });
});

describe('createMonitorTool', () => {
  it('should create tool with correct name', () => {
    const tool = createMonitorTool();
    expect(tool.name).toBe('monitor');
  });

  it('should have a callable func', () => {
    const tool = createMonitorTool();
    expect(typeof tool.func).toBe('function');
  });

  it('should return CPU info for cpu metric', async () => {
    const tool = createMonitorTool();
    const result = await tool.func({ metric: 'cpu' });
    expect(result).toContain('CPU:');
    expect(result).toContain('Cores:');
    expect(result).toContain('Load Average');
  });

  it('should return memory info for memory metric', async () => {
    const tool = createMonitorTool();
    const result = await tool.func({ metric: 'memory' });
    expect(result).toContain('Memory');
    expect(result).toContain('Used:');
    expect(result).toContain('Free:');
    expect(result).toContain('Total:');
  });

  it('should return uptime info for uptime metric', async () => {
    const tool = createMonitorTool();
    const result = await tool.func({ metric: 'uptime' });
    expect(result).toContain('Platform');
    expect(result).toContain('Hostname');
  });

  it('should return all info for all metric', async () => {
    const tool = createMonitorTool();
    const result = await tool.func({ metric: 'all' });
    expect(result).toContain('=== System Monitor ===');
    expect(result).toContain('CPU:');
    expect(result).toContain('Memory');
    expect(result).toContain('System Uptime');
  });

  it('should default to all when no metric provided', async () => {
    const tool = createMonitorTool();
    const result = await tool.func({});
    expect(result).toContain('=== System Monitor ===');
    expect(result).toContain('CPU:');
    expect(result).toContain('Memory');
  });
});
