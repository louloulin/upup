/**
 * MCP Prompts and Sampling Test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'bun:test';
import { MCPClientManager } from '../src/client';

describe('MCPClientManager - Prompts', () => {
  let manager: MCPClientManager;

  beforeEach(() => {
    manager = new MCPClientManager({ servers: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listPrompts', () => {
    it('should return empty array when no servers connected', async () => {
      const results = await manager.listPrompts();
      expect(results).toEqual([]);
    });

    it('should handle servers that do not support prompts', async () => {
      // Create a mock client that throws for prompts
      const mockClient = {
        request: vi.fn().mockRejectedValue(new Error('not implemented')),
      };

      // @ts-ignore - accessing private property for testing
      manager.clients.set('test-server', mockClient);

      const results = await manager.listPrompts();
      expect(results).toEqual([]);
    });
  });

  describe('getPrompt', () => {
    it('should throw error for non-existent server', async () => {
      await expect(
        manager.getPrompt('non-existent', 'test-prompt')
      ).rejects.toThrow('MCP server not found: non-existent');
    });
  });
});

describe('MCPClientManager - Sampling', () => {
  let manager: MCPClientManager;

  beforeEach(() => {
    manager = new MCPClientManager({ servers: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createSamplingMessage', () => {
    it('should throw error for non-existent server', async () => {
      await expect(
        manager.createSamplingMessage('non-existent', {
          messages: [{ role: 'user', content: { type: 'text', text: 'hello' } }],
        })
      ).rejects.toThrow('MCP server not found: non-existent');
    });

    it('should handle sampling errors', async () => {
      const mockClient = {
        request: vi.fn().mockRejectedValue(new Error('sampling failed')),
      };

      // @ts-ignore - accessing private property for testing
      manager.clients.set('test-server', mockClient);

      await expect(
        manager.createSamplingMessage('test-server', {
          messages: [{ role: 'user', content: { type: 'text', text: 'hello' } }],
        })
      ).rejects.toThrow('Sampling failed for test-server: sampling failed');
    });
  });
});

describe('MCPPrompt types', () => {
  it('should define prompt structure', () => {
    const prompt = {
      name: 'test-prompt',
      description: 'A test prompt',
      arguments: [
        { name: 'arg1', description: 'First argument', required: true },
      ],
    };

    expect(prompt.name).toBe('test-prompt');
    expect(prompt.description).toBe('A test prompt');
    expect(prompt.arguments).toHaveLength(1);
    expect(prompt.arguments![0].required).toBe(true);
  });
});

describe('SamplingParams types', () => {
  it('should define sampling message structure', () => {
    const message = {
      role: 'user' as const,
      content: { type: 'text' as const, text: 'Hello' },
    };

    expect(message.role).toBe('user');
    expect(message.content.type).toBe('text');
    expect(message.content.text).toBe('Hello');
  });

  it('should define sampling params structure', () => {
    const params = {
      messages: [
        { role: 'user' as const, content: { type: 'text' as const, text: 'Hello' } },
      ],
      systemPrompt: 'You are a helpful assistant',
      temperature: 0.7,
      maxTokens: 1000,
      stopSequences: ['\n\n'],
    };

    expect(params.messages).toHaveLength(1);
    expect(params.systemPrompt).toBe('You are a helpful assistant');
    expect(params.temperature).toBe(0.7);
    expect(params.maxTokens).toBe(1000);
    expect(params.stopSequences).toContain('\n\n');
  });
});
