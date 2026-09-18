import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Compare fs read strategies on the exact workload the trust/session path does.
// Paths resolve from the repo root so the script works from any cwd.
const REPO_ROOT = new URL('../../', import.meta.url).pathname;
const real = [
  'packages/pi-session/src/agent-session-factory.ts',
  'packages/pi-market-data/src/screen-eastmoney.ts',
  'packages/pi-market-data/src/quote.ts',
  'packages/pi-market-data/src/history.ts',
].map((rel) => join(REPO_ROOT, rel));
const N = 100;
const bench = async (label: string, fn: () => Promise<void> | void) => {
  for (let i = 0; i < 10; i += 1) await fn();
  const t = performance.now();
  for (let i = 0; i < N; i += 1) await fn();
  console.log(`  ${label.padEnd(38)} ${((performance.now() - t) / N * 1000).toFixed(1).padStart(9)} µs/op`);
};

console.log('reading 4 real source files (sync vs async vs Bun.file):');
await bench('readFileSync x4', () => { for (const f of real) readFileSync(f); });
await bench('await Bun.file().text() x4', async () => { for (const f of real) await Bun.file(f).text(); });
await bench('Promise.all Bun.file().arrayBuffer() x4', () => Promise.all(real.map((f) => Bun.file(f).arrayBuffer())));
await bench('Bun.file().size (stat only) x4', () => { for (const f of real) Bun.file(f).size; });
