import { beforeAll, describe, expect, test } from 'bun:test';
import { fauxAssistantMessage, fauxProvider, fauxText } from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { AgentRunnerController } from './agent-runner.js';
import { InMemoryChatHistory } from '../utils/in-memory-chat-history.js';
import { disposePiSessions } from '../runtime/pi/runner.js';
import { bootstrapPiNativeServices } from '../runtime/pi/bootstrap.js';

beforeAll(() => bootstrapPiNativeServices());

describe('AgentRunnerController Pi contract', () => {
  test('drives the CLI controller through a real Pi AgentSession fixture', async () => {
    const sessionDir = await mkdtemp(join(process.cwd(), '.upup', 'controller-pi-'));
    const previousDir = process.env.UPUP_SESSION_DIR;
    process.env.UPUP_SESSION_DIR = sessionDir;
    const faux = fauxProvider({ provider: 'upup-controller-fixture', models: [{ id: 'controller-fixture-model', reasoning: false }] });
    faux.setResponses([fauxAssistantMessage([fauxText('CLI 已通过 Pi Session 完成。')])]);
    const modelRuntime = await ModelRuntime.create({ refreshOnCreate: false });
    modelRuntime.registerNativeProvider(faux.provider);
    const history = new InMemoryChatHistory('controller-fixture-model');
    const controller = new AgentRunnerController({
      model: 'controller-fixture-model',
      modelProvider: 'upup-controller-fixture',
      modelInstance: faux.getModel(),
      modelRuntime,
    }, history);
    try {
      const result = await controller.runQuery('执行 CLI Pi fixture');
      expect(result).toEqual({ answer: 'CLI 已通过 Pi Session 完成。' });
      expect(controller.sessionId).toBeString();
      expect(controller.history.at(-1)).toMatchObject({
        query: '执行 CLI Pi fixture',
        answer: 'CLI 已通过 Pi Session 完成。',
        status: 'complete',
      });
      expect(history.getMessages().some((message) => message.answer === 'CLI 已通过 Pi Session 完成。')).toBe(true);
    } finally {
      disposePiSessions();
      if (previousDir === undefined) delete process.env.UPUP_SESSION_DIR;
      else process.env.UPUP_SESSION_DIR = previousDir;
      await rm(sessionDir, { recursive: true, force: true });
    }
  });
});
