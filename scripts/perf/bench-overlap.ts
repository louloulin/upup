import { resetHostGates, hostGateFor } from '../../packages/pi-observability/src/host-request-gate';
import { executeWithProviderRetry } from '../../packages/pi-observability/src/index';

const url = 'https://overlap.example.com/api/qt/stock/get';

// Does the retry backoff overlap the 500ms gate interval, or add to it?
async function run(baseDelayMs: number) {
  resetHostGates();
  const t = Date.now();
  const marks: string[] = [];
  let entries = 0;
  try {
    await executeWithProviderRetry(async () => {
      entries += 1;
      const n = entries;
      return hostGateFor(url).run(() => {
        marks.push(`gate-entry#${n} @+${Date.now() - t}ms`);
        return Promise.reject(new TypeError('The socket connection was closed unexpectedly'));
      });
    }, { provider: 'eastmoney', operation: 'quote', maxAttempts: 3, baseDelayMs, maxDelayMs: 5000 });
  } catch (e) {
    marks.push(`threw ${(e as Error).name} @+${Date.now() - t}ms`);
  }
  console.log(`baseDelayMs=${baseDelayMs}: total=${Date.now() - t}ms`);
  for (const m of marks) console.log(`   ${m}`);
}
await run(100);
await run(300);
await run(600);
