import { describe, expect, test } from 'bun:test';
import { fauxAssistantMessage, fauxProvider, fauxText } from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { getInvestmentAgentSpec } from './agent-spec.js';
import { PiAgentSessionFactory } from './agent-session-factory.js';

describe('Pi runtime reliability contract', () => {
  test('recovers a persisted session after a process-style dispose and stays within the fixture budget', async () => {
    const directory = await mkdtemp(join(process.cwd(), '.upup', 'pi-reliability-'));
    const sessionPath = join(directory, 'recovery.jsonl');
    const faux = fauxProvider({ provider: 'upup-reliability-fixture', models: [{ id: 'reliability-fixture-model', reasoning: false }] });
    faux.setResponses([
      fauxAssistantMessage([fauxText('第一阶段已保存。')]),
      fauxAssistantMessage([fauxText('恢复后继续完成。')]),
    ]);
    const modelRuntime = await ModelRuntime.create({ refreshOnCreate: false });
    modelRuntime.registerNativeProvider(faux.provider);
    const factory = new PiAgentSessionFactory();
    const startedAt = performance.now();
    const first = await factory.createSession(getInvestmentAgentSpec('invest-explore'), {
      cwd: directory,
      sessionPath,
      model: faux.getModel(),
      modelRuntime,
      loadRegisteredTools: false,
    });
    await first.prompt('保存第一阶段');
    await first.waitForIdle();
    first.dispose();

    const recovered = await factory.createSession(getInvestmentAgentSpec('invest-explore'), {
      cwd: directory,
      sessionPath,
      model: faux.getModel(),
      modelRuntime,
      loadRegisteredTools: false,
    });
    try {
      expect(recovered.getMessages().some((message) => typeof message === 'object' && message !== null && 'role' in message && message.role === 'assistant')).toBe(true);
      await recovered.prompt('继续第二阶段');
      await recovered.waitForIdle();
      expect(recovered.getMessages().at(-1)).toMatchObject({ role: 'assistant' });
      expect(await readFile(sessionPath, 'utf8')).toContain('恢复后继续完成。');
      expect(performance.now() - startedAt).toBeLessThan(1500);
    } finally {
      recovered.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
