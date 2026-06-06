import { describe, expect, test } from 'bun:test';
import { AgentRunnerController } from './agent-runner.js';
import { InMemoryChatHistory } from '@upup/utils/in-memory-chat-history';

describe('AgentRunnerController', () => {
  test('placeholder', () => {
    expect(typeof AgentRunnerController).toBe('function');
    expect(InMemoryChatHistory).toBeDefined();
  });
});
