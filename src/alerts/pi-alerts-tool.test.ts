import { describe, expect, it } from 'bun:test';
import { Value } from '@sinclair/typebox/value';
import { createFakeApi } from '../pi-main.js';
import {
  alertSystemParams,
  createAlertSystemTool,
  registerAlertsExtension,
} from './pi-alerts-tool.js';

describe('pi alert system tool', () => {
  it('validates discriminated action fields', () => {
    expect(Value.Check(alertSystemParams, { action: 'list' })).toBe(true);
    expect(Value.Check(alertSystemParams, { action: 'create', code: 'AAPL', alert_type: 'price', threshold: 100 })).toBe(true);
    expect(Value.Check(alertSystemParams, { action: 'invalid' })).toBe(false);
  });

  it('creates and lists an alert through strict pi execute', async () => {
    const tool = createAlertSystemTool();
    const created = await (tool.execute as any)('call', {
      action: 'create', code: 'PI-TEST', alert_type: 'price', threshold: 100,
    }, undefined, undefined, undefined);
    expect(created.details.success).toBe(true);
    expect(created.details.alert.code).toBe('PI-TEST');

    const listed = await (tool.execute as any)('call', { action: 'list', code: 'PI-TEST' }, undefined, undefined, undefined);
    expect(listed.details.success).toBe(true);
    expect(listed.details.count).toBeGreaterThan(0);
  });

  it('throws for failed side-effecting delete and honors abort', async () => {
    const tool = createAlertSystemTool();
    await expect((tool.execute as any)('call', { action: 'delete' }, undefined, undefined, undefined)).rejects.toThrow();
    const controller = new AbortController();
    controller.abort();
    await expect((tool.execute as any)('call', { action: 'create', code: 'ABORT', alert_type: 'price', threshold: 1 }, controller.signal, undefined, undefined)).rejects.toThrow('aborted');
  });

  it('registers one strict alert tool with pi metadata', () => {
    const api = createFakeApi();
    registerAlertsExtension(api);
    expect(api.tools.map((tool) => tool.name)).toEqual(['alert_system']);
    expect(api.tools[0]?.promptSnippet).toBeString();
    expect(Array.isArray(api.tools[0]?.promptGuidelines)).toBe(true);
    expect((api.tools[0]?.promptGuidelines as string[]).length).toBeGreaterThan(0);
  });
});
