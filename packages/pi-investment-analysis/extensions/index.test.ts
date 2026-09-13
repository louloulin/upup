import { describe, expect, test } from 'bun:test';
import investmentAnalysisExtension from './index.js';

describe('Pi investment-analysis extension', () => {
  test('registers auditable DCF and technical tools', async () => {
    const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
    investmentAnalysisExtension({ registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.set(tool.name, tool) } as never);
    expect([...tools.keys()]).toEqual(['investment_dcf', 'investment_technical_signal']);
    const dcf = await tools.get('investment_dcf')!.execute('dcf-1', { currentFcf: 100, growthRate: 0.08, discountRate: 0.1, terminalGrowthRate: 0.03, projectionYears: 5, sharesOutstanding: 10 }, new AbortController().signal);
    expect(JSON.parse(dcf.content[0].text)).toHaveProperty('fairValuePerShare');
    expect(dcf.details).toMatchObject({ auditId: 'dcf-1', dataFreshness: 'historical', evidence: [{ source: 'upup-fixture://investment-analysis/dcf' }] });
  });

  test('rejects an invalid DCF spread without hiding the error', async () => {
    const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
    investmentAnalysisExtension({ registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.set(tool.name, tool) } as never);
    await expect(tools.get('investment_dcf')!.execute('dcf-invalid', { currentFcf: 100, growthRate: 0.08, discountRate: 0.03, terminalGrowthRate: 0.03, projectionYears: 5, sharesOutstanding: 10 }, new AbortController().signal)).rejects.toThrow('discountRate');
  });
});
