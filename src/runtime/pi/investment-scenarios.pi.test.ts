import { describe, expect, test } from 'bun:test';
import { fauxAssistantMessage, fauxProvider, fauxText } from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import type { GatewayRuntime } from '@upup/gateway';
import { Type } from 'typebox';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { getInvestmentAgentSpec } from '@upup/pi-investment-workflow';
import { PiAgentSessionFactory } from '@upup/pi-session';
import type { UpUpToolContract } from '@upup/pi-runtime';
import { disposePiSessions } from '@upup/pi-session';
import { runAgentForMessage } from '@upup/gateway';
import { executeCronJob, type CronJob, type CronStore } from '@upup/cron';

const scenarioRuntime: GatewayRuntime = {
  agent: {
    isSessionRunning: () => false,
    runPrompt: async (_query, options) => {
      const text = 'noop-fixture';
      await options.onEvent?.({
        type: 'message_end',
        sessionId: 'scenario-fixture',
        role: 'assistant',
        text,
        stopReason: 'end_turn',
      });
      await options.onEvent?.({ type: 'agent_end', sessionId: 'scenario-fixture' });
      return text;
    },
  },
  config: {
    getConfiguredModelId: () => 'scenario-fixture-model',
    getConfiguredProvider: () => 'upup-scenario-fixture',
  },
  cron: { ensureHeartbeatCronJob: () => undefined, startCronRunner: () => ({ stop: () => undefined }) },
};

const scenarioInput = Type.Object({
  symbol: Type.Optional(Type.String()),
  portfolio: Type.Optional(Type.String()),
  query: Type.Optional(Type.String()),
});

const READONLY_SCENARIOS = [
  { id: 'invest-cn-stock-readonly', tool: 'scenario_cn_quote', value: { market: 'cn', symbol: '600519.SH', close: 1500 } },
  { id: 'invest-us-stock-readonly', tool: 'scenario_us_quote', value: { market: 'us', symbol: 'AAPL', close: 225 } },
  { id: 'invest-fund-portfolio-readonly', tool: 'scenario_fund_portfolio', value: { fund: '110011', nav: 2.4, exposure: 0.62 } },
  { id: 'invest-dcf-with-evidence', tool: 'scenario_dcf', value: { intrinsicValue: 180, terminalGrowth: 0.03 } },
  { id: 'invest-risk-dashboard', tool: 'scenario_risk', value: { var95: 0.035, maxDrawdown: -0.08 } },
  { id: 'invest-backtest', tool: 'scenario_backtest', value: { annualizedReturn: 0.12, sharpe: 1.4, maxDrawdown: -0.08 } },
] as const;

function scenarioTool(scenario: (typeof READONLY_SCENARIOS)[number]): UpUpToolContract {
  return {
    name: scenario.tool,
    label: scenario.id,
    description: `Deterministic offline fixture for ${scenario.id}.`,
    category: scenario.id.includes('risk') ? 'risk' : scenario.id.includes('backtest') ? 'valuation' : 'finance',
    safetyLevel: 'safe',
    parameters: scenarioInput,
    maxConcurrent: 2,
    hasFinancialImpact: false,
    async execute(_input, context) {
      return {
        value: scenario.value,
        text: JSON.stringify(scenario.value),
        details: {
          evidence: [{
            id: `scenario-evidence-${scenario.id}`,
            source: `upup-scenario://${scenario.id}`,
            retrievedAt: '2026-09-13T00:00:00.000Z',
            asOf: '2026-09-12',
            query: scenario.id,
            dataHash: 'b'.repeat(64),
            confidence: 'high',
          }],
          dataFreshness: scenario.id === 'invest-backtest' ? 'historical' : 'offline',
          warnings: ['Deterministic offline scenario; no external network or broker was contacted.'],
          auditId: context.auditId,
        },
      };
    },
  };
}

async function runReadonlyScenario(scenario: (typeof READONLY_SCENARIOS)[number]): Promise<void> {
  const tool = scenarioTool(scenario);
  const session = await new PiAgentSessionFactory().createSession({
    ...getInvestmentAgentSpec('invest-explore'),
    id: scenario.id,
    tools: [tool.name],
  }, {
    cwd: process.cwd(),
    tools: [tool],
  });
  try {
    const result = await session.executeTool(tool.name, `scenario-${scenario.id}`, { symbol: scenario.id }) as Awaited<ReturnType<typeof session.executeTool>> & { isError?: boolean };
    expect(result.isError).not.toBe(true);
    expect(result.details).toMatchObject({
      dataFreshness: expect.any(String),
      auditId: expect.any(String),
      evidence: [expect.objectContaining({
        source: `upup-scenario://${scenario.id}`,
        dataHash: 'b'.repeat(64),
      })],
    });
  } finally {
    session.dispose();
  }
}

describe('named Pi investment scenarios', () => {
  for (const scenario of READONLY_SCENARIOS) {
    test(scenario.id, async () => {
      await runReadonlyScenario(scenario);
    });
  }

  test('invest-session-resume', async () => {
    const directory = await mkdtemp(join(process.cwd(), '.upup', 'scenario-resume-'));
    const sessionPath = join(directory, 'scenario-resume.jsonl');
    const scenario = READONLY_SCENARIOS[0]!;
    const tool = scenarioTool(scenario);
    const spec = { ...getInvestmentAgentSpec('invest-explore'), id: 'invest-session-resume', tools: [tool.name] };
    const factory = new PiAgentSessionFactory();
    const first = await factory.createSession(spec, { cwd: directory, sessionPath, tools: [tool] });
    const firstId = first.id;
    await first.executeTool(tool.name, 'scenario-resume-call', { symbol: '600519.SH' });
    first.dispose();
    const resumed = await factory.createSession(spec, { cwd: directory, sessionPath, tools: [tool] });
    try {
      expect(resumed.id).toBe(firstId);
      expect(resumed.getSessionTree().length).toBeGreaterThan(0);
    } finally {
      resumed.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('invest-subagent-parallel', async () => {
    const directory = await mkdtemp(join(process.cwd(), '.upup', 'scenario-parallel-'));
    const factory = new PiAgentSessionFactory();
    const firstScenario = READONLY_SCENARIOS[0]!;
    const secondScenario = READONLY_SCENARIOS[1]!;
    const firstTool = scenarioTool(firstScenario);
    const secondTool = scenarioTool(secondScenario);
    const [first, second] = await Promise.all([
      factory.createSession({ ...getInvestmentAgentSpec('invest-explore'), id: 'scenario-worker-cn', tools: [firstTool.name] }, { cwd: directory, sessionPath: join(directory, 'cn.jsonl'), tools: [firstTool] }),
      factory.createSession({ ...getInvestmentAgentSpec('invest-explore'), id: 'scenario-worker-us', tools: [secondTool.name] }, { cwd: directory, sessionPath: join(directory, 'us.jsonl'), tools: [secondTool] }),
    ]);
    try {
      const results = await Promise.all([
        first.executeTool(firstTool.name, 'scenario-worker-cn-call', { symbol: '600519.SH' }),
        second.executeTool(secondTool.name, 'scenario-worker-us-call', { symbol: 'AAPL' }),
      ]) as Array<Awaited<ReturnType<typeof first.executeTool>> & { isError?: boolean }>;
      expect(results.map((result) => result.isError === true)).toEqual([false, false]);
      expect(first.id).not.toBe(second.id);
    } finally {
      first.dispose();
      second.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('invest-gateway-message', async () => {
    const directory = await mkdtemp(join(process.cwd(), '.upup', 'scenario-gateway-'));
    const previousDir = process.env.UPUP_SESSION_DIR;
    process.env.UPUP_SESSION_DIR = directory;
    const runtime: GatewayRuntime = {
      ...scenarioRuntime,
      agent: {
      isSessionRunning: () => false,
      runPrompt: async (_query, options) => {
        const text = 'Gateway scenario completed through Pi.';
        await options.onEvent?.({
          type: 'message_end',
          sessionId: 'scenario-gateway',
          role: 'assistant',
          text,
          stopReason: 'end_turn',
        });
        await options.onEvent?.({ type: 'agent_end', sessionId: 'scenario-gateway' });
        return text;
      },
      },
    };
    const faux = fauxProvider({ provider: 'upup-scenario-gateway', models: [{ id: 'scenario-gateway-model', reasoning: false }] });
    faux.setResponses([fauxAssistantMessage([fauxText('Gateway scenario completed through Pi.')])]);
    const modelRuntime = await ModelRuntime.create({ refreshOnCreate: false });
    modelRuntime.registerNativeProvider(faux.provider);
    try {
      const answer = await runAgentForMessage({
        sessionKey: 'scenario-gateway-session',
        query: '执行 Gateway 投研场景',
        model: 'scenario-gateway-model',
        modelProvider: 'upup-scenario-gateway',
        piModel: faux.getModel(),
        piModelRuntime: modelRuntime,
      }, runtime.agent);
      expect(answer).toContain('Gateway scenario completed through Pi.');
    } finally {
      disposePiSessions();
      if (previousDir === undefined) delete process.env.UPUP_SESSION_DIR;
      else process.env.UPUP_SESSION_DIR = previousDir;
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('invest-cron-run', async () => {
    const runtime: GatewayRuntime = {
      ...scenarioRuntime,
      config: { getConfiguredModelId: () => 'scenario-cron-model', getConfiguredProvider: () => 'upup-scenario-cron' },
    };
    const now = Date.now();
    const job: CronJob = {
      id: 'scenario-cron-run',
      name: 'Pi scenario cron',
      enabled: true,
      createdAtMs: now,
      updatedAtMs: now,
      schedule: { kind: 'every', everyMs: 60_000 },
      payload: { message: '执行 Cron 投研场景' },
      fulfillment: 'keep',
      state: { consecutiveErrors: 0, scheduleErrorCount: 0 },
    };
    const deliveries: string[] = [];
    const store: CronStore = { version: 1, jobs: [job] };
    await executeCronJob(job, store, {
      targetSession: {
        sessionKey: 'scenario-cron-target',
        createdAt: now,
        updatedAt: now,
        lastChannel: 'whatsapp',
        lastTo: 'scenario-user',
        lastAccountId: 'scenario-account',
        lastAgentId: 'upup-primary',
      },
      validateOutbound: () => undefined,
      runAgent: async () => 'Cron scenario completed through Pi.',
      sendMessage: async (message) => {
        deliveries.push(message.body);
        return { messageId: 'scenario-cron-message', toJid: message.to };
      },
      runtime,
    });
    expect(deliveries).toEqual(['Cron scenario completed through Pi.']);
    expect(job.state.lastRunStatus).toBe('ok');
  });
});
