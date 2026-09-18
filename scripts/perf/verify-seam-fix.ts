// Verifies the proposed P11 fix: passing the injected fetcher down to
// resolveEastmoneyUsSecid keeps the test seam intact (no real network egress).
import { resetHostGates } from '../../packages/pi-observability/src/host-request-gate';
resetHostGates();
import { resolveEastmoneyUsSecid } from '../../packages/pi-market-data/src/screen-eastmoney';

const orig = globalThis.fetch;
let realEgress = 0;
(globalThis as any).fetch = async (...a: any[]) => { realEgress++; return orig(...a); };

// The proposed fix: pass the injected fetcher through.
let stubCalls = 0;
const stub = (async () => {
  stubCalls++;
  return new Response(JSON.stringify({ QuotationCodeTable: { Data: [
    { Code: 'AAPL', Name: '苹果', Classify: 'USStock', QuoteID: '105.AAPL' },
  ] } }), { status: 200 });
}) as never;

const r = await resolveEastmoneyUsSecid('AAPL', { fetcher: stub });
console.log(`with { fetcher } passthrough: resolved=${r?.secid} stubCalls=${stubCalls} realEgress=${realEgress}`);
console.log(realEgress === 0 ? '✅ no real network egress — the seam holds' : '❌ still leaked to the network');
