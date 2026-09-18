import { resetHostGates } from '../../packages/pi-observability/src/host-request-gate';
resetHostGates();
import { resolveEastmoneyBoard } from '../../packages/pi-market-data/src/screen-eastmoney';
// Stub fetcher: return a realistic suggest payload where Classify is AStock (not BK).
const suggestPayload = { QuotationCodeTable: { Data: [
  { Code: '600519', Name: '贵州茅台', QuoteID: '1.600519', Classify: 'AStock', SecurityTypeName: '沪A' },
] } };
const fetcher = (async () => new Response(JSON.stringify(suggestPayload), { status: 200, headers: { 'content-type': 'application/json' } })) as never;

for (const kw of ['600519.SH', '600519', '白酒', 'BK0477']) {
  const t = Date.now();
  const r = await resolveEastmoneyBoard(kw, { fetcher });
  console.log(`resolveEastmoneyBoard(${JSON.stringify(kw)}) -> ${r === undefined ? 'undefined' : JSON.stringify(r)}  (${Date.now() - t}ms)`);
}
