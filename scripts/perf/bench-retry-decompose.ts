import { resetHostGates, hostGateFor, isHostThrottleError } from '../../packages/pi-observability/src/host-request-gate';
import { executeWithProviderRetry } from '../../packages/pi-observability/src/index';

const live = 'https://push2.eastmoney.com/api/qt/stock/get';
const mirror = 'https://push2delay.eastmoney.com/api/qt/stock/get';

// Mirror the real getEastmoneyQuote shape: retry EASTMONEY_RETRY per host,
// gate on the inside, mirror fallback on the outside.
async function quoteAttempt(label: string, url: string, retry: Record<string, unknown>) {
  const t = Date.now();
  const events: string[] = [];
  let entries = 0;
  try {
    await executeWithProviderRetry(async () => {
      const r = () => hostGateFor(url).run(() => {
        entries += 1;
        events.push(`entry#${entries} @+${Date.now() - t}ms`);
        return Promise.reject(new TypeError('The socket connection was closed unexpectedly'));
      });
      return r();
    }, { provider: 'eastmoney', operation: 'quote', sleep: undefined, ...retry } as never);
  } catch (e) {
    events.push(`threw ${(e as Error).name} isThrottle=${isHostThrottleError(e)} @+${Date.now() - t}ms`);
  }
  return { ms: Date.now() - t, entries, events };
}

for (const [label, retry] of [
  ['EASTMONEY_RETRY 600/5000', { maxAttempts: 3, baseDelayMs: 600, maxDelayMs: 5000 }],
  ['DEFAULT 100/2000', { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 2000 }],
] as const) {
  resetHostGates();
  const a = await quoteAttempt('live', live, retry);
  console.log(`[${label}] live only: ${a.ms}ms entries=${a.entries}`);
  for (const e of a.events) console.log(`     ${e}`);
  resetHostGates();
  const t = Date.now();
  const l = await quoteAttempt('live', live, retry);
  const m = await quoteAttempt('mirror', mirror, retry);
  console.log(`[${label}] live+mirror: ${Date.now() - t}ms (live=${l.ms} mirror=${m.ms})`);
  for (const e of l.events) console.log(`     live   ${e}`);
  for (const e of m.events) console.log(`     mirror ${e}`);
}
