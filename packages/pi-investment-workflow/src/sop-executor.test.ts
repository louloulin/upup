import { describe, expect, test } from 'bun:test';
import { executeSop, sopPhaseOrder } from './sop-executor';
import type { SopPhaseRunner, SopSynthesizerRunner } from './sop-executor';
import type { SopSpec } from './sop-spec';

const baseSop: SopSpec = {
  id: 'graham',
  name: 'Graham',
  description: 'value',
  version: '1.0.0',
  phases: [
    { id: 'detect', agent: 'invest-explore', intent: 'collect {ticker}' },
    { id: 'plan', agent: 'invest-plan', intent: 'value {ticker}', requires: ['detect'] },
    { id: 'report', agent: 'invest-review', intent: 'report', requires: ['plan'] },
  ],
};

const runner: SopPhaseRunner = async ({ phase, intent, dependencies, ticker }) => {
  return {
    output: `[${phase.id}] ${intent} ticker=${ticker ?? '-'} deps=${dependencies.length}`,
    evidence: [{ phase: phase.id }],
  };
};

describe('executeSop', () => {
  test('runs phases in topological order', async () => {
    const result = await executeSop(baseSop, runner, { ticker: '600519.SH' });
    expect(result.success).toBe(true);
    expect(result.phases.map((p) => p.phaseId)).toEqual(['detect', 'plan', 'report']);
  });

  test('interpolates {ticker} into the phase intent', async () => {
    const result = await executeSop(baseSop, runner, { ticker: '600519.SH' });
    expect(result.phases[0]!.output).toContain('collect 600519.SH');
  });

  test('propagates dependencies into subsequent phases', async () => {
    const result = await executeSop(baseSop, runner, {});
    expect(result.phases[1]!.output).toContain('deps=1');
    expect(result.phases[2]!.output).toContain('deps=1');
  });

  test('throws fail-closed when no runner is provided', async () => {
    await expect(executeSop(baseSop, undefined, {})).rejects.toThrow(/fail-closed/);
  });

  test('marks failed phase and continues', async () => {
    const failing: SopPhaseRunner = async ({ phase }) => {
      if (phase.id === 'plan') throw new Error('boom');
      return { output: 'ok' };
    };
    const result = await executeSop(baseSop, failing, {});
    expect(result.success).toBe(false);
    const plan = result.phases.find((p) => p.phaseId === 'plan');
    expect(plan?.status).toBe('failed');
    expect(plan?.error).toContain('boom');
  });

  test('pauses on approval gate', async () => {
    const result = await executeSop(baseSop, runner, { approvalGates: ['plan'] });
    expect(result.pendingApproval?.phaseId).toBe('plan');
    const plan = result.phases.find((p) => p.phaseId === 'plan');
    expect(plan?.status).toBe('approval_required');
  });

  test('skips phases listed in completedPhaseIds', async () => {
    const result = await executeSop(baseSop, runner, { completedPhaseIds: ['detect'] });
    const detect = result.phases.find((p) => p.phaseId === 'detect');
    expect(detect?.output).toBe('(resumed)');
    expect(result.success).toBe(true);
  });

  test('respects abort signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await executeSop(baseSop, runner, { signal: controller.signal });
    expect(result.success).toBe(false);
    expect(result.phases.every((p) => p.status === 'skipped')).toBe(true);
  });
});

describe('executeSop parallel groups', () => {
  const debateSop: SopSpec = {
    id: 'debate',
    name: 'Debate',
    description: 'bull/bear debate',
    version: '1.0.0',
    phases: [
      { id: 'detect', agent: 'invest-explore', intent: 'collect' },
    ],
    parallelGroups: [
      { id: 'debate', agents: ['bull-agent', 'bear-agent', 'neutral-agent'], synthesizer: 'synthesizer-agent', reduce: 'llm-arbiter' },
    ],
  };

  const synthRunner: SopSynthesizerRunner = async ({ inputs }) => ({
    output: `synthesized ${inputs.length} branches`,
    evidence: inputs.map((i) => ({ phase: i.phaseId })),
  });

  test('runs parallel branches and synthesizer', async () => {
    const result = await executeSop(debateSop, runner, { synthesizerRunner: synthRunner });
    const branchIds = result.phases.filter((p) => p.phaseId.startsWith('debate:')).map((p) => p.phaseId).sort();
    expect(branchIds).toEqual(['debate:bear-agent', 'debate:bull-agent', 'debate:neutral-agent']);
    expect(result.syntheses).toHaveLength(1);
    expect(result.syntheses[0]!.output).toContain('3 branches');
    expect(result.success).toBe(true);
  });

  test('fails parallel group without synthesizer runner', async () => {
    const result = await executeSop(debateSop, runner, {});
    expect(result.syntheses[0]!.status).toBe('failed');
    expect(result.success).toBe(false);
  });

  test('includes partial branch failures without blocking synthesis', async () => {
    const flaky: SopPhaseRunner = async ({ phase }) => {
      if (phase.agent === 'bear-agent') throw new Error('bear failed');
      return { output: 'ok' };
    };
    const result = await executeSop(debateSop, flaky, { synthesizerRunner: synthRunner });
    const bear = result.phases.find((p) => p.phaseId === 'debate:bear-agent');
    expect(bear?.status).toBe('failed');
    expect(result.syntheses[0]!.status).toBe('completed');
  });
});

describe('sopPhaseOrder', () => {
  test('returns topological order', () => {
    expect(sopPhaseOrder(baseSop)).toEqual(['detect', 'plan', 'report']);
  });

  test('handles diamond DAG', () => {
    const diamond: SopSpec = {
      ...baseSop,
      phases: [
        { id: 'a', agent: 'invest-explore', intent: 'a' },
        { id: 'b', agent: 'invest-plan', intent: 'b', requires: ['a'] },
        { id: 'c', agent: 'invest-risk', intent: 'c', requires: ['a'] },
        { id: 'd', agent: 'invest-review', intent: 'd', requires: ['b', 'c'] },
      ],
    };
    const order = sopPhaseOrder(diamond);
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'));
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('d'));
  });
});
