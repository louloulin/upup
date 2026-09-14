import { describe, expect, test } from 'bun:test';
import { fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { getInvestmentAgentSpec } from '@upup/pi-investment-workflow';
import { PiAgentSessionFactory } from '@upup/pi-session';
import type { UpUpToolContract } from '@upup/pi-runtime';
import { Type } from 'typebox';

const slowFixtureTool: UpUpToolContract = {
  name: 'fixture_slow_operation',
  label: 'Slow fixture operation',
  description: 'A cancellable deterministic operation used by lifecycle contracts.',
  category: 'market',
  safetyLevel: 'safe',
  parameters: Type.Object({}),
  hasFinancialImpact: false,
  async execute(_input: Record<string, never>, context) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 250);
      const abort = () => {
        clearTimeout(timer);
        const error = new Error('fixture operation aborted');
        error.name = 'AbortError';
        reject(error);
      };
      if (context.signal.aborted) abort();
      else context.signal.addEventListener('abort', abort, { once: true });
    });
    return {
      value: { ok: true },
      text: 'slow fixture completed',
      details: {
        evidence: [],
        dataFreshness: 'offline',
        auditId: context.auditId,
      },
    };
  },
};

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
    });
    await first.prompt('保存第一阶段');
    await first.waitForIdle();
    first.dispose();

    const recovered = await factory.createSession(getInvestmentAgentSpec('invest-explore'), {
      cwd: directory,
      sessionPath,
      model: faux.getModel(),
      modelRuntime,
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

  test('compacts a persisted session and creates an independent fork', async () => {
    const directory = await mkdtemp(join(process.cwd(), '.upup', 'pi-lifecycle-'));
    const sessionPath = join(directory, 'lifecycle.jsonl');
    const faux = fauxProvider({ provider: 'upup-lifecycle-fixture', models: [{ id: 'lifecycle-fixture-model', reasoning: false }] });
    faux.setResponses([
      fauxAssistantMessage([fauxText('阶段一研究结果：收入、利润和现金流已记录。')]),
      fauxAssistantMessage([fauxText('阶段二估值结果：假设、估值区间和风险已记录。')]),
      fauxAssistantMessage([fauxText('阶段三事件结果：公告、行业变化和证据已记录。')]),
      fauxAssistantMessage([fauxText('阶段四组合结果：仓位、归因和压力测试已记录。')]),
      fauxAssistantMessage([fauxText('压缩后的上下文摘要。')]),
    ]);
    const modelRuntime = await ModelRuntime.create({ refreshOnCreate: false });
    modelRuntime.registerNativeProvider(faux.provider);
    const session = await new PiAgentSessionFactory().createSession(getInvestmentAgentSpec('invest-explore'), {
      cwd: directory,
      sessionPath,
      model: faux.getModel(),
      modelRuntime,
    });
    try {
      const evidence = '收入、利润、现金流、估值假设、风险边界和数据来源。'.repeat(2_500);
      await session.prompt(`保存阶段一研究结果：${evidence}`);
      await session.waitForIdle();
      await session.prompt(`继续完成估值和风险分析：${evidence}`);
      await session.waitForIdle();
      await session.prompt(`继续完成事件和组合分析：${evidence}`);
      await session.waitForIdle();
      await session.compact('保留证据、假设和未完成阶段');
      const compacted = await readFile(sessionPath, 'utf8');
      expect(compacted).toContain('lifecycle');
      expect(session.getSessionTree().length).toBeGreaterThan(0);
      const forkedPath = session.fork();
      expect(forkedPath).toBeString();
      expect(forkedPath).not.toBe(sessionPath);
      expect(await readFile(forkedPath!, 'utf8')).toContain('lifecycle');
    } finally {
      session.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('keeps the same session recoverable after a provider failure and retry', async () => {
    const directory = await mkdtemp(join(process.cwd(), '.upup', 'pi-provider-retry-'));
    const sessionPath = join(directory, 'provider-retry.jsonl');
    const faux = fauxProvider({ provider: 'upup-provider-retry-fixture', models: [{ id: 'provider-retry-model', reasoning: false }] });
    faux.setResponses([
      fauxAssistantMessage('', { stopReason: 'error', errorMessage: 'transient fixture failure' }),
      fauxAssistantMessage([fauxText('重试成功，Session 状态保持可恢复。')]),
    ]);
    const modelRuntime = await ModelRuntime.create({ refreshOnCreate: false });
    modelRuntime.registerNativeProvider(faux.provider);
    const session = await new PiAgentSessionFactory().createSession(getInvestmentAgentSpec('invest-explore'), {
      cwd: directory,
      sessionPath,
      model: faux.getModel(),
      modelRuntime,
    });
    const events: string[] = [];
    const unsubscribe = session.subscribe((event) => events.push(event.type));
    try {
      await session.prompt('触发一次临时 provider 错误');
      await session.waitForIdle();
      expect(events).toContain('session_error');
      await session.prompt('请在同一个 Session 中重试');
      await session.waitForIdle();
      expect(session.getMessages().at(-1)).toMatchObject({ role: 'assistant' });
      expect(await readFile(sessionPath, 'utf8')).toContain('重试成功');
    } finally {
      unsubscribe();
      session.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('aborts an in-flight Pi turn without corrupting JSONL and retries the same session', async () => {
    const directory = await mkdtemp(join(process.cwd(), '.upup', 'pi-abort-recovery-'));
    const sessionPath = join(directory, 'abort-recovery.jsonl');
    const faux = fauxProvider({ provider: 'upup-abort-recovery-fixture', models: [{ id: 'abort-recovery-model', reasoning: false }] });
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall('fixture_slow_operation', {})]),
      fauxAssistantMessage([fauxText('abort 后已在同一 Session 恢复。')]),
    ]);
    const modelRuntime = await ModelRuntime.create({ refreshOnCreate: false });
    modelRuntime.registerNativeProvider(faux.provider);
    const session = await new PiAgentSessionFactory().createSession(getInvestmentAgentSpec('invest-explore'), {
      cwd: directory,
      sessionPath,
      tools: [slowFixtureTool],
      model: faux.getModel(),
      modelRuntime,
    });
    const events: string[] = [];
    const controller = new AbortController();
    const unsubscribe = session.subscribe((event) => {
      events.push(event.type);
      if (event.type === 'tool_start') controller.abort();
    });
    try {
      const prompt = session.prompt('执行一个可取消的长任务', { signal: controller.signal });
      await prompt.catch(() => undefined);
      await session.waitForIdle();
      expect(events).toContain('session_error');
      const persistedLines = (await readFile(sessionPath, 'utf8')).split('\n').filter(Boolean);
      expect(() => persistedLines.forEach((line) => JSON.parse(line))).not.toThrow();
      await session.prompt('请在同一个 Session 中恢复');
      await session.waitForIdle();
      expect(session.getMessages().at(-1)).toMatchObject({ role: 'assistant' });
      expect(await readFile(sessionPath, 'utf8')).toContain('abort 后已在同一 Session 恢复');
    } finally {
      unsubscribe();
      session.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
