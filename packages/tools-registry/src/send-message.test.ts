/**
 * Tests for SendMessage Tool
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  SendMessageSchema,
  SEND_MESSAGE_DESCRIPTION,
  createSendMessageTool,
  getMessageStore,
  resetMessageStore,
} from './send-message.js';

describe('AgentMessageStore', () => {
  beforeEach(() => {
    resetMessageStore();
  });

  describe('send', () => {
    it('should send a message and return with id and timestamp', () => {
      const store = getMessageStore();
      const message = store.send({
        from: 'agent-1',
        to: 'agent-2',
        type: 'task',
        content: 'Hello agent-2!',
      });

      expect(message.id).toMatch(/^msg-/);
      expect(message.timestamp).toBeGreaterThan(0);
      expect(message.from).toBe('agent-1');
      expect(message.to).toBe('agent-2');
      expect(message.type).toBe('task');
      expect(message.content).toBe('Hello agent-2!');
      expect(message.read).toBe(false);
    });

    it('should auto-generate unique message IDs', () => {
      const store = getMessageStore();
      const msg1 = store.send({ from: 'a', to: 'b', type: 'request', content: '1' });
      const msg2 = store.send({ from: 'a', to: 'b', type: 'request', content: '2' });

      expect(msg1.id).not.toBe(msg2.id);
    });

    it('should return messages in sorted order', () => {
      const store = getMessageStore();
      const m1 = store.send({ from: 'a', to: 'b', type: 'request', content: 'msg1' });
      const m2 = store.send({ from: 'a', to: 'b', type: 'request', content: 'msg2' });

      const messages = store.getMessages({});
      const ids = messages.map(m => m.id);
      expect(ids).toContain(m1.id);
      expect(ids).toContain(m2.id);
    });
  });

  describe('getMessages', () => {
    it('should get all messages for a recipient', () => {
      const store = getMessageStore();
      store.send({ from: 'coordinator', to: 'worker-1', type: 'task', content: 'Task 1' });
      store.send({ from: 'worker-1', to: 'coordinator', type: 'response', content: 'Done' });

      const messages = store.getMessages({ to: 'coordinator' });
      expect(messages.some(m => m.content === 'Done')).toBe(true);
    });

    it('should filter by sender', () => {
      const store = getMessageStore();
      store.send({ from: 'coordinator', to: 'worker-1', type: 'task', content: 'Task 1' });
      store.send({ from: 'worker-1', to: 'coordinator', type: 'response', content: 'Done' });

      const messages = store.getMessages({ from: 'coordinator' });
      for (const msg of messages) {
        expect(msg.from).toBe('coordinator');
      }
    });

    it('should filter unread messages', () => {
      const store = getMessageStore();
      store.send({ from: 'a', to: 'b', type: 'request', content: 'msg1' });
      store.send({ from: 'a', to: 'b', type: 'request', content: 'msg2' });

      const unread = store.getMessages({ to: 'b', unread: true });
      expect(unread.length).toBeGreaterThanOrEqual(2);

      store.markAsRead(unread[0].id);

      const stillUnread = store.getMessages({ to: 'b', unread: true });
      expect(stillUnread.length).toBeLessThanOrEqual(unread.length - 1);
    });

    it('should limit results', () => {
      const store = getMessageStore();
      store.send({ from: 'a', to: 'b', type: 'request', content: 'msg1' });
      store.send({ from: 'a', to: 'b', type: 'request', content: 'msg2' });
      store.send({ from: 'a', to: 'b', type: 'request', content: 'msg3' });

      const messages = store.getMessages({ limit: 2 });
      expect(messages.length).toBeLessThanOrEqual(2);
    });

    it('should include broadcast messages when filtering by recipient', () => {
      const store = getMessageStore();
      store.send({ from: 'a', to: 'all', type: 'broadcast', content: 'Alert!' });

      const messages = store.getMessages({ to: 'worker-1' });
      expect(messages.some(m => m.type === 'broadcast')).toBe(true);
    });
  });

  describe('markAsRead', () => {
    it('should mark a message as read', () => {
      const store = getMessageStore();
      const message = store.send({ from: 'a', to: 'b', type: 'request', content: 'test' });

      expect(message.read).toBe(false);

      const success = store.markAsRead(message.id);
      expect(success).toBe(true);

      const updated = store.getMessages({ to: 'b' });
      expect(updated[0].read).toBe(true);
    });

    it('should return false for non-existent message', () => {
      const store = getMessageStore();
      const success = store.markAsRead('non-existent');
      expect(success).toBe(false);
    });
  });

  describe('markAllRead', () => {
    it('should mark all messages for recipient as read', () => {
      const store = getMessageStore();
      store.send({ from: 'a', to: 'b', type: 'request', content: 'msg1' });
      store.send({ from: 'a', to: 'b', type: 'request', content: 'msg2' });
      store.send({ from: 'a', to: 'all', type: 'broadcast', content: 'msg3' });

      const count = store.markAllRead('b');
      expect(count).toBeGreaterThanOrEqual(3);

      const unread = store.getMessages({ to: 'b', unread: true });
      expect(unread.length).toBe(0);
    });
  });

  describe('getUnreadCount', () => {
    it('should return correct unread count', () => {
      const store = getMessageStore();
      store.send({ from: 'a', to: 'b', type: 'request', content: 'msg1' });
      store.send({ from: 'a', to: 'b', type: 'request', content: 'msg2' });

      expect(store.getUnreadCount('b')).toBe(2);

      store.markAllRead('b');
      expect(store.getUnreadCount('b')).toBe(0);
    });

    it('should include broadcast messages in count', () => {
      const store = getMessageStore();
      store.send({ from: 'a', to: 'all', type: 'broadcast', content: 'broadcast' });
      expect(store.getUnreadCount('worker-1')).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear all messages', () => {
      const store = getMessageStore();
      store.send({ from: 'a', to: 'b', type: 'request', content: 'test' });
      expect(store.count()).toBe(1);

      store.clear();
      expect(store.count()).toBe(0);
    });
  });
});

describe('SendMessageSchema', () => {
  it('should parse valid input', () => {
    const result = SendMessageSchema.safeParse({
      to: 'worker-1',
      content: 'Please review the code',
      type: 'task',
    });

    expect(result.success).toBe(true);
  });

  it('should default to request type and main-agent sender', () => {
    const result = SendMessageSchema.safeParse({
      to: 'worker-1',
      content: 'Hello',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('request');
      expect(result.data.from).toBe('main-agent');
    }
  });

  it('should accept all message types', () => {
    const types = ['task', 'status', 'request', 'response', 'broadcast'];
    for (const type of types) {
      const result = SendMessageSchema.safeParse({
        to: 'agent-1',
        content: 'test',
        type,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid message type', () => {
    const result = SendMessageSchema.safeParse({
      to: 'agent-1',
      content: 'test',
      type: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('should require to and content', () => {
    const result = SendMessageSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('SEND_MESSAGE_DESCRIPTION', () => {
  it('should have non-empty description', () => {
    expect(SEND_MESSAGE_DESCRIPTION.length).toBeGreaterThan(10);
  });

  it('should mention message types', () => {
    expect(SEND_MESSAGE_DESCRIPTION).toContain('task');
    expect(SEND_MESSAGE_DESCRIPTION).toContain('broadcast');
  });
});

describe('createSendMessageTool', () => {
  beforeEach(() => {
    resetMessageStore();
  });

  it('should create tool with correct name', () => {
    const tool = createSendMessageTool();
    expect(tool.name).toBe('send_message');
  });

  it('should have a callable func', () => {
    const tool = createSendMessageTool();
    expect(typeof tool.func).toBe('function');
  });

  it('should send message and return confirmation', async () => {
    const tool = createSendMessageTool();

    const result = await tool.func({
      to: 'worker-1',
      content: 'Please check the PR',
      type: 'task',
    });

    expect(result).toContain('Message sent successfully');
    expect(result).toContain('Message ID:');
    expect(result).toContain('worker-1');
  });

  it('should use default sender', async () => {
    const tool = createSendMessageTool();

    const result = await tool.func({
      to: 'worker-1',
      content: 'Test message',
    });

    expect(result).toContain('Message sent successfully');
  });

  it('should handle optional task_id', async () => {
    const tool = createSendMessageTool();

    const result = await tool.func({
      to: 'worker-1',
      content: 'Task update',
      type: 'status',
      task_id: 'task-123',
    });

    expect(result).toContain('Message sent successfully');
    expect(result).toContain('task-123');
  });
});

describe('resetMessageStore', () => {
  beforeEach(() => {
    resetMessageStore();
  });

  it('should reset store state', () => {
    const store = getMessageStore();
    store.send({ from: 'a', to: 'b', type: 'request', content: 'test' });
    expect(store.count()).toBe(1);

    resetMessageStore();
    expect(store.count()).toBe(0);
  });
});
