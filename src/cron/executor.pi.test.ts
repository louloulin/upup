import { describe, expect, test } from 'bun:test';
import { fauxAssistantMessage, fauxProvider, fauxText } from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import type { CronJob, CronStore } from './types.js';
import { executeCronJob } from './executor.js';
import type { AgentRunRequest } from '../gateway/agent-runner.js';

function createJob(): CronJob {
  const now = Date.now();
  return {
    id: 'cron-pi-fixture',
    name: 'Pi fixture alert',
    enabled: true,
    createdAtMs: now,
    updatedAtMs: now,
    schedule: { kind: 'every', everyMs: 60_000 },
    payload: { message: '检查 fixture 条件' },
    fulfillment: 'keep',
    state: { consecutiveErrors: 0, scheduleErrorCount: 0 },
  };
}

describe('Cron Pi contract', () => {
  test('executes through the injected Pi runner and delivers actionable output', async () => {
    const faux = fauxProvider({ provider: 'upup-cron-fixture', models: [{ id: 'cron-fixture-model', reasoning: false }] });
    faux.setResponses([fauxAssistantMessage([fauxText('发现可行动的 fixture 信号。')])]);
    const modelRuntime = await ModelRuntime.create({ refreshOnCreate: false });
    modelRuntime.registerNativeProvider(faux.provider);
    const requests: AgentRunRequest[] = [];
    const deliveries: Array<{ to: string; body: string; accountId?: string }> = [];
    const job = createJob();
    const store: CronStore = { version: 1, jobs: [job] };

    await executeCronJob(job, store, {
      targetSession: {
        sessionKey: 'whatsapp:fixture',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastChannel: 'whatsapp',
        lastTo: '+8613800000000',
        lastAccountId: 'fixture-account',
        lastAgentId: 'upup-primary',
      },
      validateOutbound: () => undefined,
      runAgent: async (request) => {
        requests.push(request);
        const { runAgentForMessage } = await import('../gateway/agent-runner.js');
        return runAgentForMessage(request);
      },
      sendMessage: async (message) => {
        deliveries.push(message);
        return { messageId: 'fixture-message', toJid: message.to };
      },
      piModel: faux.getModel(),
      piModelRuntime: modelRuntime,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.sessionKey).toBe('cron:cron-pi-fixture');
    expect(requests[0]?.isolatedSession).toBe(true);
    expect(requests[0]?.piModel).toBe(faux.getModel());
    expect(deliveries).toEqual([{
      to: '+8613800000000',
      body: '发现可行动的 fixture 信号。',
      accountId: 'fixture-account',
    }]);
    expect(job.state.lastRunStatus).toBe('ok');
  });

  test('suppresses the Pi heartbeat token without delivery', async () => {
    const job = createJob();
    const store: CronStore = { version: 1, jobs: [job] };
    let deliveryCount = 0;

    await executeCronJob(job, store, {
      targetSession: {
        sessionKey: 'whatsapp:fixture',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastChannel: 'whatsapp',
        lastTo: '+8613800000000',
        lastAccountId: 'fixture-account',
        lastAgentId: 'upup-primary',
      },
      validateOutbound: () => undefined,
      runAgent: async () => 'HEARTBEAT_OK',
      sendMessage: async () => {
        deliveryCount += 1;
        return { messageId: 'fixture-message', toJid: '+8613800000000' };
      },
    });

    expect(deliveryCount).toBe(0);
    expect(job.state.lastRunStatus).toBe('suppressed');
  });
});
