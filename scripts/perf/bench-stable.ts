import { createHash } from 'node:crypto';
import { canonicalJson, hashDossier } from '../../packages/pi-storage/src/index';

// Interleaved, warmed, many iterations: removes ordering/JIT bias.
function compare(label: string, a: () => void, b: () => void, n = 300) {
  for (let i = 0; i < 100; i += 1) { a(); b(); }
  let ta = 0, tb = 0;
  for (let i = 0; i < n; i += 1) {
    let t = performance.now(); a(); ta += performance.now() - t;
    t = performance.now(); b(); tb += performance.now() - t;
  }
  ta /= n; tb /= n;
  console.log(`${label}`);
  console.log(`   A ${ta.toFixed(4)}ms  B ${tb.toFixed(4)}ms   ratio ${(tb / ta).toFixed(1)}x`);
  return [ta, tb] as const;
}

const buf = Buffer.alloc(200 * 1024, 7);
compare('hash 200KB: A=Bun.hash  B=node sha256',
  () => { Bun.hash(buf); },
  () => { createHash('sha256').update(buf).digest('hex'); });

compare('hash 200KB: A=Bun.CryptoHasher  B=node sha256',
  () => { const h = new Bun.CryptoHasher('sha256'); h.update(buf); h.digest('hex'); },
  () => { createHash('sha256').update(buf).digest('hex'); });

const dossier = {
  ticker: '600519.SH',
  snapshot: { name: '贵州茅台', sector: '白酒', marketCap: 1.9e12, summary: 'x'.repeat(400), oneLiner: 'y'.repeat(80) },
  metricsHistory: Array.from({ length: 200 }, (_, i) => ({ key: `k${i}`, value: i * 1.5, currency: 'CNY', ts: Date.now(), source: 'eastmoney' })),
  theses: [], watchTriggers: [], earningsCalls: [],
  freshnessTs: Date.now(), createdTs: Date.now(), updatedTs: Date.now(),
};
compare('serialize 200-metric dossier: A=canonicalJson  B=JSON.stringify',
  () => { canonicalJson(dossier); },
  () => { JSON.stringify(dossier); });

const json = JSON.stringify({ rows: Array.from({ length: 500 }, (_, i) => ({ f12: String(i), f14: `r${i}`, f2: i * 1.5 })) });
compare('parse 500-row payload: A=JSON.parse  B=structuredClone(parse)',
  () => { JSON.parse(json); },
  () => { structuredClone(JSON.parse(json)); });
