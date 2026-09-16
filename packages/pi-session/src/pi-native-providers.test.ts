import { describe, expect, test } from 'bun:test';
import { resolvePiCapabilityHost, type PiCapabilityEventBus } from '@upup/pi-capability-registry';
import { createEastmoneyResearchDataFetcher } from '@upup/pi-finance-sdk';
import { installPiNativeCapabilityProviders, piNativeFinanceSessionOptions } from './pi-native-providers';

function eventBus(): PiCapabilityEventBus {
  const handlers = new Map<string, Set<(data: unknown) => void>>();
  return {
    emit(channel, data) {
      for (const handler of handlers.get(channel) ?? []) handler(data);
    },
    on(channel, handler) {
      const set = handlers.get(channel) ?? new Set();
      set.add(handler);
      handlers.set(channel, set);
      return () => { set.delete(handler); };
    },
  };
}

function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
}

interface WorkflowHost {
  readonly sessionId: string;
  readonly providers: { workflow?: { getInvestmentWorkflowServices?: () => { getResearchData: (ticker: string, signal?: AbortSignal, market?: 'cn' | 'hk' | 'us') => Promise<{ price: string; ratios: string; estimates: string; earnings: string; filings: string }> } } };
}

/**
 * Transport double for the public 东方财富 endpoints the CN research path
 * reads. Pi-native sessions must reach these through the options handed to
 * `installPiNativeCapabilityProviders`; the regression this guards is the TUI
 * publishing a tree without them, which made `/invest <A-share>` answer
 * `research provider unavailable for market cn`.
 */
const eastmoneyTransport = (async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('push2.eastmoney.com')) return json({ data: { f43: 125800, f58: '贵州茅台', f59: 2, f60: 126500, f86: 1789000000 } });
  if (url.includes('RPT_LICO_FN_CPD')) return json({ result: { data: [{ SECUCODE: '600519.SH', SECURITY_NAME_ABBR: '贵州茅台', REPORTDATE: '2026-06-30 00:00:00', DATATYPE: '2026年 半年报', TOTAL_OPERATE_INCOME: 92278072083.21, PARENT_NETPROFIT: 44516880421.86, BASIC_EPS: 35.57, WEIGHTAVG_ROE: 16.75, XSMLL: 89.55 }] } });
  if (url.includes('reportapi.eastmoney.com')) return json({ hits: 1, data: [{ title: '2026年中报点评', orgSName: '西南证券', publishDate: '2026-08-21 00:00:00.000', emRatingName: '买入', predictThisYearEps: '69.83', predictThisYearPe: '18.59' }] });
  if (url.includes('np-anotice-stock')) return json({ data: { list: [{ art_code: 'AN202608141827994407', title: '贵州茅台:2026年半年度报告', notice_date: '2026-08-15 00:00:00', columns: [{ column_name: '其他' }] }] } });
  throw new Error(`unexpected request in the Pi-native provider test: ${url}`);
}) as typeof fetch;

describe('Pi-native capability providers', () => {
  test('carries the caller session options into the published finance tree', () => {
    const picked = piNativeFinanceSessionOptions({
      researchDataFetchers: { cn: createEastmoneyResearchDataFetcher({ market: 'cn', fetcher: eastmoneyTransport }) },
      researchDataProviders: { cn: 'eastmoney' },
      // Session-shape options the finance composition must not receive.
      sessionPath: '/tmp/session.jsonl',
      skills: ['market-data'],
    } as never);
    expect(Object.keys(picked).sort()).toEqual(['researchDataFetchers', 'researchDataProviders']);
    expect(piNativeFinanceSessionOptions(undefined)).toEqual({});
  });

  test('serves CN research data through the published workflow host', async () => {
    const events = eventBus();
    const installed = installPiNativeCapabilityProviders({
      sessionId: 'pi-native-providers-test',
      cwd: process.cwd(),
      events,
      sessionOptions: {
        researchDataFetchers: { cn: createEastmoneyResearchDataFetcher({ market: 'cn', fetcher: eastmoneyTransport }) },
        researchDataProviders: { cn: 'eastmoney' },
      },
    });
    try {
      expect(installed.packages).toContain('@upup/pi-investment-workflow');
      const host = resolvePiCapabilityHost<WorkflowHost>(events, '@upup/pi-investment-workflow', 'pi-native-providers-test');
      const services = host?.providers.workflow?.getInvestmentWorkflowServices?.();
      expect(services).toBeDefined();
      const data = await services!.getResearchData('600519.SH', undefined, 'cn');
      expect(data.price).toContain('push2.eastmoney.com');
      expect(data.ratios).toContain('datacenter-web.eastmoney.com');
      expect(data.filings).toContain('np-anotice-stock.eastmoney.com');
    } finally {
      installed.release();
      await installed.dispose();
    }
  });
});
