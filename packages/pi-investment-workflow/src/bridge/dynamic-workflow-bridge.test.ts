import { describe, expect, it } from 'bun:test';
import { sopToDynamicWorkflowScript } from './dynamic-workflow-bridge';
import { loadSops } from '../sop-loader';
import type { SopSpec } from '../sop-spec';

function loadBuiltinSop(id: string): SopSpec {
  const result = loadSops({ disableBuiltins: false, cwd: '/tmp', home: '/tmp' });
  const sop = result.sops.find((s) => s.id === id);
  if (!sop) throw new Error(`SOP ${id} not found`);
  return sop;
}

describe('sopToDynamicWorkflowScript', () => {
  it('produces a valid JS script for the graham SOP', () => {
    const spec = loadBuiltinSop('graham');
    const { script, meta } = sopToDynamicWorkflowScript(spec, { ticker: '600519.SH' });
    expect(script).toContain('export const meta');
    expect(script).toContain("phase('detect')");
    expect(script).toContain('await agent(');
    expect(meta.name).toBe('upup_sop_graham');
    expect(meta.phases.length).toBe(spec.phases.length);
  });

  it('emits a parallel group for the debate SOP', () => {
    const spec = loadBuiltinSop('debate');
    const { script } = sopToDynamicWorkflowScript(spec, { ticker: 'AAPL' });
    expect(script).toContain('await parallel([');
    expect(script).toContain("phase('debate')");
  });

  it('interpolates {ticker} into the phase intent', () => {
    const spec = loadBuiltinSop('graham');
    const { script } = sopToDynamicWorkflowScript(spec, { ticker: '00700.HK' });
    expect(script).toContain('00700.HK');
  });

  it('works with the momentum SOP', () => {
    const spec = loadBuiltinSop('momentum');
    const { script } = sopToDynamicWorkflowScript(spec, { ticker: 'NVDA' });
    expect(script).toContain("phase('detect')");
    expect(meta_script_guard(script));
  });

  it('returns a synthesis reference when parallel groups exist', () => {
    const spec = loadBuiltinSop('debate');
    const { script } = sopToDynamicWorkflowScript(spec, { ticker: 'AAPL' });
    expect(script).toMatch(/return synthesis_debate/);
  });
});

function meta_script_guard(script: string): boolean {
  return script.includes('export const meta') && script.includes('await agent(');
}
