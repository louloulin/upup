/**
 * Plugin Commands Test
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  pluginListCommand,
  pluginInfoCommand,
  pluginEnableCommand,
  pluginDisableCommand,
  pluginSearchCommand,
} from './plugin.js';

describe('pluginListCommand', () => {
  it('should have correct name and description', () => {
    expect(pluginListCommand.name).toBe('plugin list');
    expect(pluginListCommand.description).toBe('List all installed plugins with their status');
  });

  it('should execute without error', async () => {
    const context = { args: [], options: {} } as any;
    const result = await pluginListCommand.execute(context);
    expect(result.success).toBe(true);
  });
});

describe('pluginInfoCommand', () => {
  it('should have correct name and description', () => {
    expect(pluginInfoCommand.name).toBe('plugin info');
    expect(pluginInfoCommand.description).toBe('Show detailed information about a plugin');
  });

  it('should require plugin name argument', async () => {
    const context = { args: [], options: {} } as any;
    const result = await pluginInfoCommand.execute(context);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Usage');
  });

  it('should show error for non-existent plugin', async () => {
    const context = { args: ['non-existent-plugin-xyz'], options: {} } as any;
    const result = await pluginInfoCommand.execute(context);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});

describe('pluginEnableCommand', () => {
  it('should have correct name and description', () => {
    expect(pluginEnableCommand.name).toBe('plugin enable');
    expect(pluginEnableCommand.description).toBe('Enable a plugin');
  });

  it('should require plugin name argument', async () => {
    const context = { args: [], options: {} } as any;
    const result = await pluginEnableCommand.execute(context);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Usage');
  });
});

describe('pluginDisableCommand', () => {
  it('should have correct name and description', () => {
    expect(pluginDisableCommand.name).toBe('plugin disable');
    expect(pluginDisableCommand.description).toBe('Disable a plugin');
  });

  it('should require plugin name argument', async () => {
    const context = { args: [], options: {} } as any;
    const result = await pluginDisableCommand.execute(context);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Usage');
  });
});

describe('pluginSearchCommand', () => {
  it('should have correct name and description', () => {
    expect(pluginSearchCommand.name).toBe('plugin search');
    expect(pluginSearchCommand.description).toBe('Search plugins by name or description');
  });

  it('should require search query argument', async () => {
    const context = { args: [], options: {} } as any;
    const result = await pluginSearchCommand.execute(context);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Usage');
  });

  it('should search with query', async () => {
    const context = { args: ['test'], options: {} } as any;
    const result = await pluginSearchCommand.execute(context);
    expect(result.success).toBe(true);
  });
});

describe('Command aliases', () => {
  it('should have aliases for list command', () => {
    expect(pluginListCommand.aliases).toContain('plugins');
    expect(pluginListCommand.aliases).toContain('pl');
  });

  it('should have aliases for info command', () => {
    expect(pluginInfoCommand.aliases).toContain('pi');
  });

  it('should have aliases for enable command', () => {
    expect(pluginEnableCommand.aliases).toContain('pen');
  });

  it('should have aliases for disable command', () => {
    expect(pluginDisableCommand.aliases).toContain('pdis');
  });

  it('should have aliases for search command', () => {
    expect(pluginSearchCommand.aliases).toContain('ps');
  });
});