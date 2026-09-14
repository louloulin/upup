import { describe, expect, test } from 'bun:test';
import { AgentRunnerController, InMemoryChatHistory } from '@upup/pi-tui-app';
import { createTestPorts } from './agent-runner-test-ports.test.js';

describe('AgentRunnerController', () => {
  test('updates the active agent config for subsequent runs', () => {
    const controller = new AgentRunnerController(
      { model: 'gpt-5.4', modelProvider: 'openai', maxIterations: 10 },
      new InMemoryChatHistory('gpt-5.4'),
      createTestPorts(),
    );

    controller.updateAgentConfig({
      model: 'ollama:llama3.1',
      modelProvider: 'ollama',
    });

    expect(controller.currentConfig).toMatchObject({
      model: 'ollama:llama3.1',
      modelProvider: 'ollama',
      maxIterations: 10,
    });
  });
});
