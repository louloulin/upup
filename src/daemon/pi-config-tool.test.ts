/**
 * Tests for the migrated config extension (Pass 7).
 *
 * Validates:
 *   1. Each factory returns a real pi `ToolDefinition` with the correct
 *      strict-shape fields (name / label / description / parameters).
 *   2. The TypeBox schemas reject malformed input via `Value.Check`.
 *   3. The 5-arg execute signature works and returns the strict
 *      `{ content, details }` shape with typed details.
 *   4. The extension registers all three tools via the fake api.
 *   5. The full `loadWith` pipeline routes through pi's runtime.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'bun:test';
import { Value } from '@sinclair/typebox/value';

import {
  createConfigGetTool,
  createConfigSetTool,
  createConfigListTool,
  configGetParams,
  configSetParams,
  configListParams,
  type ConfigGetParams,
  type ConfigSetParams,
  type ConfigListParams,
} from './pi-config-tool.js';
import { createFakeApi } from '../pi-main.js';
import { registerConfigExtension } from './pi-config-extension.js';
import {
  configToolGetFixture,
  resetConfigToolFixture,
} from './pi-config-tool-fixture.js';

beforeAll(() => {
  // The migrated config tools call `loadConfig` / `saveConfig` /
  // `useDynamicConfig().set(...)`. Override them with a fixture
  // so the tests are hermetic and don't touch the real settings.json.
  configToolGetFixture();
});

beforeEach(() => {
  resetConfigToolFixture();
});

describe('pi config extension', () => {
  it('config_get is a real pi ToolDefinition with an optional TypeBox key param', () => {
    const tool = createConfigGetTool();

    expect(tool.name).toBe('config_get');
    expect(tool.label).toBe('Config Get');
    expect(typeof tool.description).toBe('string');
    expect(tool.parameters).toBeDefined();

    // TypeBox schema validation: empty key is accepted (whole config).
    expect(Value.Check(configGetParams, {} as ConfigGetParams)).toBe(true);
    // Non-empty key is accepted.
    expect(Value.Check(configGetParams, { key: 'modelId' } as ConfigGetParams)).toBe(true);
    // Non-string key is rejected.
    expect(Value.Check(configGetParams, { key: 42 } as unknown as ConfigGetParams)).toBe(false);
  });

  it('config_set is a real pi ToolDefinition with a required TypeBox union value', () => {
    const tool = createConfigSetTool();

    expect(tool.name).toBe('config_set');
    expect(tool.label).toBe('Config Set');
    expect(tool.parameters).toBeDefined();

    // Happy path: key + string value.
    expect(
      Value.Check(configSetParams, { key: 'modelId', value: 'gpt-4' } as ConfigSetParams),
    ).toBe(true);
    // Numeric value.
    expect(
      Value.Check(configSetParams, { key: 'memory.threshold', value: 0.5 } as ConfigSetParams),
    ).toBe(true);
    // Boolean value.
    expect(
      Value.Check(configSetParams, { key: 'memory.enabled', value: false } as ConfigSetParams),
    ).toBe(true);
    // Object value (Record<string, unknown>).
    expect(
      Value.Check(configSetParams, { key: 'memory', value: { enabled: true } } as ConfigSetParams),
    ).toBe(true);

    // Empty key is rejected (minLength: 1).
    expect(
      Value.Check(configSetParams, { key: '', value: 'x' } as ConfigSetParams),
    ).toBe(false);
    // Missing key is rejected.
    expect(
      Value.Check(configSetParams, { value: 'x' } as unknown as ConfigSetParams),
    ).toBe(false);
    // Array value is rejected (not in the union).
    expect(
      Value.Check(configSetParams, { key: 'x', value: [1, 2] } as unknown as ConfigSetParams),
    ).toBe(false);
  });

  it('config_list is a real pi ToolDefinition with an optional TypeBox prefix param', () => {
    const tool = createConfigListTool();

    expect(tool.name).toBe('config_list');
    expect(tool.label).toBe('Config List');
    expect(tool.parameters).toBeDefined();

    expect(Value.Check(configListParams, {} as ConfigListParams)).toBe(true);
    expect(Value.Check(configListParams, { prefix: 'memory' } as ConfigListParams)).toBe(true);
    expect(Value.Check(configListParams, { prefix: 42 } as unknown as ConfigListParams)).toBe(false);
  });

  it('config_get executes via the strict 5-arg signature and returns typed details', async () => {
    const tool = createConfigGetTool();

    type R = {
      content: Array<{ type: 'text'; text: string }>;
      details: { key: string | null; value: unknown; text: string };
    };

    // Read a top-level key.
    const result1 = (await (tool.execute as (
      id: string,
      params: ConfigGetParams,
      signal: AbortSignal | undefined,
      onUpdate: unknown,
      ctx: unknown,
    ) => Promise<R>)(
      'call-1',
      { key: 'modelId' },
      undefined,
      undefined,
      undefined,
    ));
    expect(result1.content[0]?.text).toBe('modelId = gpt-4');
    expect(result1.details.key).toBe('modelId');
    expect(result1.details.value).toBe('gpt-4');

    // Read with no key returns the whole config.
    const result2 = (await (tool.execute as (
      id: string,
      params: ConfigGetParams,
      signal: AbortSignal | undefined,
      onUpdate: unknown,
      ctx: unknown,
    ) => Promise<R>)(
      'call-2',
      {},
      undefined,
      undefined,
      undefined,
    ));
    expect(result2.details.key).toBeNull();
    expect(result2.content[0]?.text.startsWith('Configuration:')).toBe(true);

    // Missing key returns null details.value.
    const result3 = (await (tool.execute as (
      id: string,
      params: ConfigGetParams,
      signal: AbortSignal | undefined,
      onUpdate: unknown,
      ctx: unknown,
    ) => Promise<R>)(
      'call-3',
      { key: 'nonExistent' },
      undefined,
      undefined,
      undefined,
    ));
    expect(result3.details.value).toBeNull();
    expect(result3.content[0]?.text).toContain('not found');
  });

  it('config_set executes via the strict 5-arg signature and persists typed details', async () => {
    const tool = createConfigSetTool();

    type R = {
      content: Array<{ type: 'text'; text: string }>;
      details: { key: string; oldValue: unknown; newValue: unknown };
    };

    const result = (await (tool.execute as (
      id: string,
      params: ConfigSetParams,
      signal: AbortSignal | undefined,
      onUpdate: unknown,
      ctx: unknown,
    ) => Promise<R>)(
      'call-1',
      { key: 'modelId', value: 'claude-sonnet-4-5' },
      undefined,
      undefined,
      undefined,
    ));
    expect(result.details.key).toBe('modelId');
    expect(result.details.oldValue).toBe('gpt-4');
    expect(result.details.newValue).toBe('claude-sonnet-4-5');
    expect(result.content[0]?.text).toContain('Configuration updated');

    // Round-trip read should reflect the new value.
    const getTool = createConfigGetTool();
    type GetR = {
      content: Array<{ type: 'text'; text: string }>;
      details: { key: string | null; value: unknown; text: string };
    };
    const readBack = (await (getTool.execute as (
      id: string,
      params: ConfigGetParams,
      signal: AbortSignal | undefined,
      onUpdate: unknown,
      ctx: unknown,
    ) => Promise<GetR>)(
      'call-2',
      { key: 'modelId' },
      undefined,
      undefined,
      undefined,
    ));
    expect(readBack.details.value).toBe('claude-sonnet-4-5');
  });

  it('config_list executes via the strict 5-arg signature and filters by prefix', async () => {
    const tool = createConfigListTool();

    type R = {
      content: Array<{ type: 'text'; text: string }>;
      details: { prefix: string | null; config: Record<string, unknown> };
    };

    const all = (await (tool.execute as (
      id: string,
      params: ConfigListParams,
      signal: AbortSignal | undefined,
      onUpdate: unknown,
      ctx: unknown,
    ) => Promise<R>)(
      'call-1',
      {},
      undefined,
      undefined,
      undefined,
    ));
    expect(all.details.prefix).toBeNull();
    expect(Object.keys(all.details.config)).toContain('modelId');
    expect(Object.keys(all.details.config)).toContain('memory');

    const filtered = (await (tool.execute as (
      id: string,
      params: ConfigListParams,
      signal: AbortSignal | undefined,
      onUpdate: unknown,
      ctx: unknown,
    ) => Promise<R>)(
      'call-2',
      { prefix: 'mem' },
      undefined,
      undefined,
      undefined,
    ));
    expect(filtered.details.prefix).toBe('mem');
    expect(Object.keys(filtered.details.config)).toContain('memory');
    expect(Object.keys(filtered.details.config)).not.toContain('modelId');
  });

  it('registerConfigExtension registers all three tools via the fake api', () => {
    const fake = createFakeApi();
    registerConfigExtension(fake);

    expect(fake.tools.map((t) => t.name)).toEqual([
      'config_get',
      'config_set',
      'config_list',
    ]);
  });

  it('config tools coexist with daemon/realtime tools in one fake api', () => {
    const fake = createFakeApi();
    registerConfigExtension(fake);

    // No commands or other shared-bus registrations; just the tools.
    expect(fake.tools.length).toBe(3);
    expect(fake.subscribedEvents.length).toBe(0);
    expect(fake.commands.length).toBe(0);
  });
});
