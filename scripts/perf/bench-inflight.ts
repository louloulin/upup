import { resetHostGates } from '../../packages/pi-observability/src/host-request-gate';
resetHostGates();
import { createEastmoneyScreenLoader } from '../../packages/pi-market-data/src/screen-eastmoney';
let upstream = 0;
const slowStub = (async () => {
  upstream += 1;
  await new Promise((r) => setTimeout(r, 30));   // simulate a slower provider
  return new Response(JSON.stringify({ rc: 0, data: { total: 1, diff: [{ f12: '600519', f14: '贵州茅台', f2: 1, f3: 1, f20: 1, f100: '白酒' }] } }), { status: 200 });
}) as typeof fetch;
const loader = createEastmoneyScreenLoader({ fetcher: slowStub });
const req = { universe: 'cn', keywords: [], filters: [{ field: 'pe', op: '<', value: 15 }], limit: 20 } as never;
const t = Date.now();
await Promise.all([loader(req), loader(req), loader(req), loader(req), loader(req)]);
console.log(`5 CONCURRENT identical queries -> ${upstream} upstream calls in ${Date.now() - t}ms`);
console.log(upstream === 1 ? '  (coalesced)' : `  => WASTE: ${upstream - 1} redundant upstream calls`);
