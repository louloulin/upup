/**
 * Tests for ConfigTool
 */

import { describe, it, expect, vi, beforeEach } from 'bun:test';
import {
  ConfigToolGetSchema,
  ConfigToolSetSchema,
  ConfigToolListSchema,
  CONFIG_TOOL_GET_DESCRIPTION,
  CONFIG_TOOL_SET_DESCRIPTION,
  CONFIG_TOOL_LIST_DESCRIPTION,
  createConfigGetTool,
  createConfigSetTool,
  createConfigListTool,
  getConfigValue,
  setConfigValue,
} from './config-tool.js';

describe('getConfigValue', () => {
  const config = {
    modelId: 'gpt-4',
    memory: {
      enabled: true,
      embeddingProvider: 'openai',
    },
    nested: {
      deep: {
        value: 42,
      },
    },
  };

  it('should get top-level value', () => {
    expect(getConfigValue(config, 'modelId')).toBe('gpt-4');
  });

  it('should get nested value with dot notation', () => {
    expect(getConfigValue(config, 'memory.enabled')).toBe(true);
    expect(getConfigValue(config, 'memory.embeddingProvider')).toBe('openai');
  });

  it('should get deeply nested value', () => {
    expect(getConfigValue(config, 'nested.deep.value')).toBe(42);
  });

  it('should return undefined for non-existent key', () => {
    expect(getConfigValue(config, 'nonExistent')).toBeUndefined();
    expect(getConfigValue(config, 'memory.nonExistent')).toBeUndefined();
    expect(getConfigValue(config, 'nested.deep.nonExistent')).toBeUndefined();
  });

  it('should return undefined for partial path', () => {
    expect(getConfigValue(config, '')).toBeUndefined();
  });
});

describe('setConfigValue', () => {
  it('should set top-level value', () => {
    const config: Record<string, unknown> = {};
    setConfigValue(config, 'modelId', 'gpt-4');
    expect(config.modelId).toBe('gpt-4');
  });

  it('should set nested value with dot notation', () => {
    const config: Record<string, unknown> = { memory: {} };
    setConfigValue(config, 'memory.enabled', false);
    expect((config.memory as Record<string, unknown>).enabled).toBe(false);
  });

  it('should create nested objects as needed', () => {
    const config: Record<string, unknown> = {};
    setConfigValue(config, 'memory.embeddingProvider', 'openai');
    expect((config.memory as Record<string, unknown>).embeddingProvider).toBe('openai');
  });

  it('should set deeply nested value', () => {
    const config: Record<string, unknown> = {};
    setConfigValue(config, 'nested.deep.value', 100);
    const nested = config.nested as Record<string, unknown>;
    const deep = nested.deep as Record<string, unknown>;
    expect(deep.value).toBe(100);
  });

  it('should overwrite existing value', () => {
    const config = { modelId: 'old-model' };
    setConfigValue(config as Record<string, unknown>, 'modelId', 'new-model');
    expect(config.modelId).toBe('new-model');
  });

  it('should handle different value types', () => {
    const config: Record<string, unknown> = {};
    setConfigValue(config, 'bool', true);
    setConfigValue(config, 'num', 42);
    setConfigValue(config, 'str', 'hello');
    setConfigValue(config, 'obj', { key: 'value' });

    expect(config.bool).toBe(true);
    expect(config.num).toBe(42);
    expect(config.str).toBe('hello');
    expect(config.obj).toEqual({ key: 'value' });
  });
});

describe('ConfigToolGetSchema', () => {
  it('should parse valid input with key', () => {
    const result = ConfigToolGetSchema.safeParse({ key: 'modelId' });
    expect(result.success).toBe(true);
  });

  it('should parse valid input without key', () => {
    const result = ConfigToolGetSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept dot notation keys', () => {
    const result = ConfigToolGetSchema.safeParse({ key: 'memory.enabled' });
    expect(result.success).toBe(true);
  });
});

describe('ConfigToolSetSchema', () => {
  it('should parse valid string value', () => {
    const result = ConfigToolSetSchema.safeParse({ key: 'modelId', value: 'gpt-4' });
    expect(result.success).toBe(true);
  });

  it('should parse valid number value', () => {
    const result = ConfigToolSetSchema.safeParse({ key: 'threshold', value: 10 });
    expect(result.success).toBe(true);
  });

  it('should parse valid boolean value', () => {
    const result = ConfigToolSetSchema.safeParse({ key: 'enabled', value: true });
    expect(result.success).toBe(true);
  });

  it('should parse valid object value', () => {
    const result = ConfigToolSetSchema.safeParse({
      key: 'memory',
      value: { enabled: true },
    });
    expect(result.success).toBe(true);
  });

  it('should require key', () => {
    const result = ConfigToolSetSchema.safeParse({ value: 'test' });
    expect(result.success).toBe(false);
  });

  it('should require value', () => {
    const result = ConfigToolSetSchema.safeParse({ key: 'modelId' });
    expect(result.success).toBe(false);
  });
});

describe('ConfigToolListSchema', () => {
  it('should parse valid input with prefix', () => {
    const result = ConfigToolListSchema.safeParse({ prefix: 'memory' });
    expect(result.success).toBe(true);
  });

  it('should parse valid input without prefix', () => {
    const result = ConfigToolListSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('Tool Descriptions', () => {
  it('should have non-empty descriptions', () => {
    expect(CONFIG_TOOL_GET_DESCRIPTION.length).toBeGreaterThan(10);
    expect(CONFIG_TOOL_SET_DESCRIPTION.length).toBeGreaterThan(10);
    expect(CONFIG_TOOL_LIST_DESCRIPTION.length).toBeGreaterThan(10);
  });

  it('should mention configuration keys', () => {
    expect(CONFIG_TOOL_GET_DESCRIPTION).toContain('configuration');
    expect(CONFIG_TOOL_SET_DESCRIPTION).toContain('configuration');
  });

  it('should mention configuration keys', () => {
    expect(CONFIG_TOOL_GET_DESCRIPTION).toContain('modelId');
    expect(CONFIG_TOOL_SET_DESCRIPTION).toContain('modelId');
  });
});

describe('createConfigGetTool', () => {
  it('should create tool with correct name', () => {
    const tool = createConfigGetTool();
    expect(tool.name).toBe('config_get');
  });

  it('should have a callable func', () => {
    const tool = createConfigGetTool();
    expect(typeof tool.func).toBe('function');
  });
});

describe('createConfigSetTool', () => {
  it('should create tool with correct name', () => {
    const tool = createConfigSetTool();
    expect(tool.name).toBe('config_set');
  });

  it('should have a callable func', () => {
    const tool = createConfigSetTool();
    expect(typeof tool.func).toBe('function');
  });
});

describe('createConfigListTool', () => {
  it('should create tool with correct name', () => {
    const tool = createConfigListTool();
    expect(tool.name).toBe('config_list');
  });

  it('should have a callable func', () => {
    const tool = createConfigListTool();
    expect(typeof tool.func).toBe('function');
  });
});
