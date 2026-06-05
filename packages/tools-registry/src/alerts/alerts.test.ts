/**
 * Unit tests for Alert System Tool
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import { createAlertSystem } from './index';

describe('Alert System Tool', () => {
  const mockModel = 'test-model';
  let tool: any;

  beforeEach(() => {
    tool = createAlertSystem(mockModel);
  });

  test('should create tool with correct name', () => {
    expect(tool.name).toBe('alert_system');
  });

  test('should have correct description', () => {
    expect(tool.description).toContain('alert_system');
    expect(tool.description).toContain('alert');
  });

  test('should have schema with action enum', () => {
    expect(tool.schema).toBeDefined();
    expect(tool.schema.shape.action).toBeDefined();
  });

  test('should handle create action with validation', async () => {
    // Without required params should return error
    const result = await tool.invoke({ action: 'create' });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
  });

  test('should handle list action', async () => {
    const result = await tool.invoke({ action: 'list' });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.alerts).toBeDefined();
  });

  test('should handle history action', async () => {
    const result = await tool.invoke({ action: 'history' });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
  });

  test('should handle check action', async () => {
    const result = await tool.invoke({ action: 'check' });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
  });

  test('should handle delete without alert_id', async () => {
    const result = await tool.invoke({ action: 'delete' });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toBeDefined();
  });
});
