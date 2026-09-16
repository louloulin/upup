import { describe, expect, it, beforeEach, afterEach } from 'bun:test';

import { createPiNativeSessionOptions } from './default';

const ORIGINAL_ENV = { ...process.env };

describe('createPiNativeSessionOptions', () => {
  beforeEach(() => {
    delete process.env.TUSHARE_TOKEN;
    delete process.env.FINANCIAL_DATASETS_API_KEY;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('wires CN/HK research providers without a Tushare token (免凭证 Eastmoney)', () => {
    const options = createPiNativeSessionOptions();
    expect(Object.keys(options.researchDataFetchers ?? {}).sort()).toEqual(['cn', 'hk', 'us']);
    expect(options.researchDataProviders).toEqual({ cn: 'eastmoney', hk: 'eastmoney', us: 'sec-edgar' });
  });

  it('keeps US research on SEC EDGAR when no Financial Datasets key is set', () => {
    const options = createPiNativeSessionOptions();
    expect(Object.keys(options.researchDataFetchers ?? {}).sort()).toEqual(['cn', 'hk', 'us']);
    expect(options.researchDataProviders).toEqual({ cn: 'eastmoney', hk: 'eastmoney', us: 'sec-edgar' });
  });

  it('does not drop CN/HK when both china and US research blocks are present', () => {
    // Regression: `{ ...chinaResearch, ...usResearch }` overwrote the
    // researchDataFetchers map wholesale, leaving only the US entry. The
    // spread must be done per market inside the nested maps.
    const options = createPiNativeSessionOptions();
    expect(options.researchDataFetchers).toBeDefined();
    expect(options.researchDataFetchers!.cn).toBeDefined();
    expect(options.researchDataFetchers!.hk).toBeDefined();
    expect(options.researchDataFetchers!.us).toBeDefined();
    // Each fetcher must be a callable function.
    expect(typeof options.researchDataFetchers!.cn).toBe('function');
    expect(typeof options.researchDataFetchers!.hk).toBe('function');
    expect(typeof options.researchDataFetchers!.us).toBe('function');
  });

  it('uses Tushare for CN/HK when TUSHARE_TOKEN is set, without losing the US provider', () => {
    process.env.TUSHARE_TOKEN = 'tushare-test-token';
    const options = createPiNativeSessionOptions();
    expect(Object.keys(options.researchDataFetchers ?? {}).sort()).toEqual(['cn', 'hk', 'us']);
    expect(options.researchDataProviders).toEqual({ cn: 'tushare', hk: 'tushare', us: 'sec-edgar' });
    expect(options.researchDataApiKeys).toEqual({ cn: 'tushare-test-token', hk: 'tushare-test-token' });
  });

  it('uses Financial Datasets for US when the key is set, without losing the CN/HK providers', () => {
    process.env.TUSHARE_TOKEN = 'tushare-test-token';
    process.env.FINANCIAL_DATASETS_API_KEY = 'fdk-test-key';
    const options = createPiNativeSessionOptions();
    expect(Object.keys(options.researchDataFetchers ?? {}).sort()).toEqual(['cn', 'hk', 'us']);
    expect(options.researchDataProviders).toEqual({ cn: 'tushare', hk: 'tushare', us: 'financial-datasets' });
    expect(options.researchDataApiKeys).toEqual({ cn: 'tushare-test-token', hk: 'tushare-test-token', us: 'fdk-test-key' });
    // marketHistory keeps the same shape (no overwrite collapse).
    expect(Object.keys(options.marketHistoryProviders ?? {}).sort()).toEqual(['cn', 'hk', 'us']);
    expect(Object.keys(options.marketHistoryApiKeys ?? {}).sort()).toEqual(['cn', 'hk', 'us']);
  });
});
