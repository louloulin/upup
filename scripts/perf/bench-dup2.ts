import { resetHostGates } from '../../packages/pi-observability/src/host-request-gate';
resetHostGates();
const calls: { key: string; n: number; wasted?: boolean }[] = [];
// Realistic stub: `suggest` returns what Eastmoney really returns -- BK boards for
// a Chinese keyword, and stock entries (Classify=stock) for a numeric ticker.
const stub = (async (input: any) => {
  const u = new URL(String(input));
  const kw = u.searchParams.get('input') ?? '';
  const key = `${u.host}${u.pathname} input=${kw} secid=${u.searchParams.get('secid') ?? ''}`;
  const hit = calls.find((c) => c.key === key);
  if (hit) hit.n += 1; else calls.push({ key, n: 1 });

  if (u.pathname.includes('suggest')) {
    const isTicker = /^\d{5,6}(\.(SH|SZ|BJ|HK))?$/i.test(kw);
    const Data = isTicker
      ? [{ Code: '600519', Name: '贵州茅台', Classify: 'AStock', QuoteID: '1.600519' }]
      : [{ Code: 'BK0493', Name: '新能源', Classify: 'BK', QuoteID: '90.BK0493' }];
    return new Response(JSON.stringify({ QuotationCodeTable: { Data } }), { status: 200 });
  }
  if (u.pathname.includes('stock/get')) {
    return new Response(JSON.stringify({ rc: 0, data: { f57: '600519', f58: '贵州茅台', f127: '白酒Ⅱ', f128: '贵州' } }), { status: 200 });
  }
  return new Response(JSON.stringify({ rc: 0, data: { total: 45, diff: [{ f12: '600519', f14: '贵州茅台', f2: 1500, f3: 1, f9: 20, f20: 1, f23: 6, f100: '白酒Ⅱ' }] } }), { status: 200 });
}) as typeof fetch;

const { querySectorSnapshot } = await import('../../packages/pi-market-data/src/market-structure-eastmoney');
for (const [code, type] of [['600519.SH', 'industry'], ['白酒', 'concept']] as const) {
  calls.length = 0;
  const t = Date.now();
  const r = await querySectorSnapshot(code, type, { fetcher: stub });
  console.log(`querySectorSnapshot(${JSON.stringify(code)}): ${Date.now() - t}ms | ${calls.length} distinct / ${calls.reduce((s, c) => s + c.n, 0)} total requests | sector=${(r as {sector?:string}).sector}`);
  for (const c of calls) console.log(`   x${c.n}  ${c.key.slice(0, 82)}`);
  console.log();
}
process.exit(0);
