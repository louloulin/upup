import { describe, expect, test } from 'bun:test';
import { fauxAssistantMessage, fauxProvider, fauxText } from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { disposePiSessions } from '../runtime/pi/runner.js';
import { runAgentForMessage } from './agent-runner.js';

describe('Gateway Pi runner contract', () => {
  test('runs through Pi AgentSession, emits adapted events, and resumes the same JSONL session', async () => {
    const tempDir = await mkdtemp(join(process.cwd(), '.upup', 'gateway-pi-'));
    const previousDir = process.env.UPUP_SESSION_DIR;
    process.env.UPUP_SESSION_DIR = tempDir;
    const faux = fauxProvider({ provider: 'upup-gateway-fixture', models: [{ id: 'gateway-fixture-model', reasoning: false }] });
    faux.setResponses([
      fauxAssistantMessage([fauxText('第一轮已通过 Pi。')]),
      fauxAssistantMessage([fauxText('第二轮恢复成功。')]),
    ]);
    const modelRuntime = await ModelRuntime.create({ refreshOnCreate: false });
    modelRuntime.registerNativeProvider(faux.provider);
    const events: string[] = [];
    try {
      const first = await runAgentForMessage({
        sessionKey: 'gateway-fixture-session',
        query: '执行第一轮',
        model: 'gateway-fixture-model',
        modelProvider: 'upup-gateway-fixture',
        piModel: faux.getModel(),
        piModelRuntime: modelRuntime,
        onEvent: (event) => { events.push(event.type); },
      });
      const second = await runAgentForMessage({
        sessionKey: 'gateway-fixture-session',
        query: '执行第二轮',
        model: 'gateway-fixture-model',
        modelProvider: 'upup-gateway-fixture',
        piModel: faux.getModel(),
        piModelRuntime: modelRuntime,
      });
      expect(first).toBe('第一轮已通过 Pi。');
      expect(second).toBe('第二轮恢复成功。');
      expect(events).toContain('stream_progress');
      expect(events).toContain('done');
      const files = await Array.fromAsync(new Bun.Glob('*.jsonl').scan({ cwd: tempDir }));
      expect(files.length).toBeGreaterThan(0);
      const jsonl = await Bun.file(join(tempDir, files[0]!)).text();
      expect(jsonl).toContain('第一轮已通过 Pi。');
      expect(jsonl).toContain('第二轮恢复成功。');
    } finally {
      disposePiSessions();
      if (previousDir === undefined) delete process.env.UPUP_SESSION_DIR;
      else process.env.UPUP_SESSION_DIR = previousDir;
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
