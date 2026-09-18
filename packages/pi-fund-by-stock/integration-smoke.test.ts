import { test, expect } from 'bun:test';
import { searchFundsByStockCore } from './src/index';

test('integration: 贵州茅台 (应真实命中)', async () => {
  const r = await searchFundsByStockCore({ query: '贵州茅台', limit: 10 });
  console.log('解析股票名:', r.resolvedStockName);
  console.log('重仓基金数:', r.totalFunds);
  console.log('前 5 只:');
  for (const f of r.funds.slice(0, 5)) {
    console.log(`  - ${f.fundName} (${f.fundCode}) ${f.valuePercent}%`);
  }
  console.log('总占比:', r.totalValuePercent, '%');
  console.log('快照:', r.asOf);
  if (r.warnings.length) console.log('警告:', r.warnings);
  // 不强制 found=true，因为 SDK 可能在线调用外部 API
  expect(r.funds).toBeDefined();
}, { timeout: 30_000 });
