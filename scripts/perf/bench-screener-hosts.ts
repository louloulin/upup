import { resetHostGates } from '../../packages/pi-observability/src/host-request-gate';
resetHostGates();
const orig = globalThis.fetch;
const per: Record<string, number> = {};
globalThis.fetch = (async (input: any, init?: any) => {
  const h = new URL(String(input)).host;
  per[h] = (per[h] ?? 0) + 1;
  return orig(input, init);
}) as typeof fetch;
const { screenEastmoneyStocks } = await import('../../packages/pi-market-data/src/screen-eastmoney');
const t = Date.now();
await screenEastmoneyStocks({ market: 'cn', limit: 20 });
console.log(`screenEastmoneyStocks(cn,limit=20): ${Date.now() - t}ms`);
for (const [h, n] of Object.entries(per).sort()) console.log(`   ${h}: ${n} requests  (its own gate ⇒ ${(n - 1) * 500}ms of pacing if serial)`);
console.log(`\nNote: each host has a SEPARATE gate (host-request-gate.ts:121 keys by host),`);
console.log(`so requests to different hosts overlap; only same-host requests queue.`);
