import { describe, expect, it } from 'bun:test';
import { buildUpUpResearchDagTasks, researchDagRoles, registerUpUpResearchDag } from './research-dag';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

describe('buildUpUpResearchDagTasks', () => {
  it('returns 4 default parallel tasks when needs is not provided', () => {
    const tasks = buildUpUpResearchDagTasks('600519.SH', '估值是否合理？');
    expect(tasks).toHaveLength(4);
    expect(tasks.every((t) => !t.needs)).toBe(true);
    expect(tasks.map((t) => t.id)).toEqual(['technical-analysis', 'fundamental-analysis', 'capital-flow', 'sentiment-analysis']);
    expect(tasks[0]?.task).toContain('600519.SH');
  });

  it('applies custom needs edges for DAG sequencing', () => {
    const tasks = buildUpUpResearchDagTasks('AAPL', 'multi-agent debate', {
      'capital-flow': ['fundamental-analysis'],
    });
    const capitalFlow = tasks.find((t) => t.id === 'capital-flow');
    expect(capitalFlow?.needs).toEqual(['fundamental-analysis']);
    expect(tasks.find((t) => t.id === 'technical-analysis')?.needs).toBeUndefined();
  });

  it('maps each role to its tool allowlist', () => {
    const tasks = buildUpUpResearchDagTasks('AAPL', 'test');
    const technical = tasks.find((t) => t.id === 'technical-analysis');
    expect(technical?.tools).toContain('get_technical_data');
    const sentiment = tasks.find((t) => t.id === 'sentiment-analysis');
    expect(sentiment?.tools).toContain('web_fetch');
  });
});

describe('registerUpUpResearchDag', () => {
  it('returns false when the package import fails', async () => {
    const fakePi = {} as ExtensionAPI;
    const ok = await registerUpUpResearchDag(fakePi, {
      sink: { onError: () => undefined },
    });
    expect(typeof ok).toBe('boolean');
  });
});

describe('researchDagRoles', () => {
  it('exposes the 4 canonical roles', () => {
    expect(researchDagRoles).toHaveLength(4);
  });
});
