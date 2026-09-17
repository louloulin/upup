import { describe, expect, it } from 'bun:test';
import { loadSops } from '../sop-loader';
import { sopToDynamicWorkflowScript } from './dynamic-workflow-bridge';

describe('sopToDynamicWorkflowScript', () => {
  it('loads all 5 built-in SOPs and produces valid scripts', () => {
    const { sops } = loadSops({ disableBuiltins: false, cwd: '/tmp', home: '/tmp' });
    expect(sops.length).toBeGreaterThanOrEqual(5);
    for (const spec of sops) {
      const result = sopToDynamicWorkflowScript(spec, { ticker: 'AAPL' });
      expect(result.script).toContain('export const meta');
      expect(result.script).toContain('await agent(');
      expect(result.meta.name).toContain('upup_sop_');
    }
  });
});
