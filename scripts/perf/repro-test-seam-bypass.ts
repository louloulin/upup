import { resetHostGates } from '../../packages/pi-observability/src/host-request-gate';
resetHostGates();
const t0 = Date.now();
const seen: string[] = [];
// Count what the INJECTED fetcher sees vs what actually egresses.
const origFetch = globalThis.fetch;
(globalThis as any).fetch = async (input: any, init?: any) => {
  seen.push(`REAL   @+${String(Date.now() - t0).padStart(5)}ms ${String(input).slice(0, 70)}`);
  return origFetch(input, init);
};
const { NativeMarketQuoteClient } = await import('../../packages/pi-market-data/src/quote');

const injected: string[] = [];
const client = new NativeMarketQuoteClient({
  retry: { maxAttempts: 1, baseDelayMs: 1, sleep: async () => {} },
  fetcher: async (input: any) => {
    injected.push(`INJECT @+${String(Date.now() - t0).padStart(5)}ms ${String(input).slice(0, 70)}`);
    return new Response('forbidden', { status: 403 });
  },
}) as any;

try { await client.getQuote('AAPL', 'us'); } catch (e) { injected.push(`THREW  ${(e as Error).message.slice(0, 60)}`); }
console.log('--- what the INJECTED fetcher received ---');
for (const s of injected) console.log('  ' + s);
console.log('--- what actually hit the NETWORK (bypassing the injected fetcher) ---');
for (const s of seen) console.log('  ' + s);
console.log(`\ntotal=${Date.now() - t0}ms`);
