/**
 * Tests for NotifyTool
 */

import { describe, it, expect, vi, beforeEach } from 'bun:test';
import {
  NotifySchema,
  NotifyListSchema,
  NOTIFY_DESCRIPTION,
  NOTIFY_LIST_DESCRIPTION,
  createNotifyTool,
  createNotifyListTool,
  createNotificationStore,
  type NotificationStore,
} from './notify-tool.js';

describe('NotifySchema', () => {
  it('should parse valid webhook input', () => {
    const result = NotifySchema.safeParse({
      channel: 'webhook',
      url: 'https://hooks.example.com/test',
      title: 'Test',
      message: 'Hello world',
    });
    expect(result.success).toBe(true);
  });

  it('should parse valid log input', () => {
    const result = NotifySchema.safeParse({
      channel: 'log',
      title: 'Test',
      message: 'Hello world',
    });
    expect(result.success).toBe(true);
  });

  it('should parse with level', () => {
    const result = NotifySchema.safeParse({
      channel: 'log',
      title: 'Alert',
      message: 'Something happened',
      level: 'critical',
    });
    expect(result.success).toBe(true);
  });

  it('should require channel', () => {
    const result = NotifySchema.safeParse({ title: 'Test', message: 'msg' });
    expect(result.success).toBe(false);
  });

  it('should require title', () => {
    const result = NotifySchema.safeParse({ channel: 'log', message: 'msg' });
    expect(result.success).toBe(false);
  });

  it('should require message', () => {
    const result = NotifySchema.safeParse({ channel: 'log', title: 'Test' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid channel', () => {
    const result = NotifySchema.safeParse({ channel: 'email', title: 'Test', message: 'msg' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid url', () => {
    const result = NotifySchema.safeParse({
      channel: 'webhook',
      url: 'not-a-url',
      title: 'Test',
      message: 'msg',
    });
    expect(result.success).toBe(false);
  });
});

describe('NotifyListSchema', () => {
  it('should parse empty input', () => {
    const result = NotifyListSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should parse with filters', () => {
    const result = NotifyListSchema.safeParse({ channel: 'log', level: 'error', limit: 10 });
    expect(result.success).toBe(true);
  });
});

describe('Tool Descriptions', () => {
  it('should have non-empty descriptions', () => {
    expect(NOTIFY_DESCRIPTION.length).toBeGreaterThan(10);
    expect(NOTIFY_LIST_DESCRIPTION.length).toBeGreaterThan(10);
  });

  it('should mention notification or alert', () => {
    expect(NOTIFY_DESCRIPTION).toMatch(/notification|alert/i);
    expect(NOTIFY_LIST_DESCRIPTION).toMatch(/notification/i);
  });
});

describe('createNotifyTool', () => {
  it('should create tool with name notify', () => {
    const tool = createNotifyTool();
    expect(tool.name).toBe('notify');
  });

  it('should have callable func', () => {
    const tool = createNotifyTool();
    expect(typeof tool.func).toBe('function');
  });

  it('should send log notification', async () => {
    const tool = createNotifyTool();
    const result = await tool.func({
      channel: 'log',
      title: 'Test Alert',
      message: 'Something happened',
    });
    expect(result).toContain('Notification sent via log');
    expect(result).toContain('Test Alert');
    expect(result).toContain('ID: notif-');
  });

  it('should send with critical level', async () => {
    const tool = createNotifyTool();
    const result = await tool.func({
      channel: 'log',
      title: 'Critical Alert',
      message: 'System down!',
      level: 'critical',
    });
    expect(result).toContain('critical');
  });

  it('should fail webhook without URL', async () => {
    const tool = createNotifyTool();
    const result = await tool.func({
      channel: 'webhook',
      title: 'Test',
      message: 'msg',
    });
    expect(result).toContain('URL required');
  });

  it('should fail feishu without URL', async () => {
    const tool = createNotifyTool();
    const result = await tool.func({
      channel: 'feishu',
      title: 'Test',
      message: 'msg',
    });
    expect(result).toContain('URL required');
  });
});

describe('createNotifyListTool', () => {
  let store: NotificationStore;

  beforeEach(async () => {
    store = createNotificationStore();
    // Send a few log notifications
    const tool = createNotifyTool({ store });
    await tool.func({ channel: 'log', title: 'First', message: 'm1' });
    await tool.func({ channel: 'log', title: 'Second', message: 'm2', level: 'warning' });
    await tool.func({ channel: 'log', title: 'Third', message: 'm3', level: 'error' });
  });

  it('should create tool with name notify_list', () => {
    const tool = createNotifyListTool({ store });
    expect(tool.name).toBe('notify_list');
  });

  it('should list notifications', async () => {
    const tool = createNotifyListTool({ store });
    const result = await tool.func({});
    expect(result).toContain('Notifications');
    expect(result).toContain('First');
    expect(result).toContain('Second');
    expect(result).toContain('Third');
  });

  it('should filter by channel', async () => {
    const tool = createNotifyListTool({ store });
    const result = await tool.func({ channel: 'log' });
    expect(result).toContain('Notifications');
  });

  it('should filter by level', async () => {
    const tool = createNotifyListTool({ store });
    const result = await tool.func({ level: 'error' });
    expect(result).toContain('Third');
    expect(result).not.toContain('First');
  });

  it('should respect limit', async () => {
    const tool = createNotifyListTool({ store });
    const result = await tool.func({ limit: 1 });
    expect(result).toContain('Notifications (1)');
    // Only 1 notification shown
    const lines = result.split('\n').filter((l: string) => l.includes('[log]'));
    expect(lines.length).toBe(1);
  });
});
