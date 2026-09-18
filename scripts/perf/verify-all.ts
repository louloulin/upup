import { appendFileSync } from 'node:fs';
import { resetHostGates, createHostRequestGate, hostGateFor } from '../../packages/pi-observability/src/host-request-gate';
const out: string[] = [];
const log = (s: string) => out.push(s);

// 1. gate pacing
{
  const g = createHostRequestGate({ host: 'v1' });
  const t = Date.now();
  await Promise.all(Array.from({ length: 5 }, () => g.run(async () => new Response('{}'))));
  log(`1. 5 gated no-op requests: ${Date.now() - t}ms  (expect ~2000ms = 4 x 500ms)`);
}
// 2. gate serializes independent work
{
  const g = createHostRequestGate({ host: 'v2' });
  const t = Date.now();
  await Promise.all(Array.from({ length: 5 }, () => g.run(async () => { await new Promise((r) => setTimeout(r, 50)); return 1; })));
  log(`2. 5 concurrent 50ms jobs through one gate: ${Date.now() - t}ms (parallel would be ~50ms)`);
}
// 3. same-host requests queue; different hosts do not
{
  resetHostGates();
  const t = Date.now();
  await Promise.all(Array.from({ length: 4 }, (_, i) => hostGateFor(new URL(`https://same.example.com/${i}`)).run(async () => new Response('{}'))));
  const same = Date.now() - t;
  resetHostGates();
  const t2 = Date.now();
  await Promise.all(Array.from({ length: 4 }, (_, i) => hostGateFor(new URL(`https://h${i}.example.com/`)).run(async () => new Response('{}'))));
  log(`3. 4 requests, 1 host: ${same}ms | 4 requests, 4 hosts: ${Date.now() - t2}ms`);
}
// 4. real network tolerance of the mirror
{
  const mk = (p: number) => { const u = new URL('https://push2delay.eastmoney.com/api/qt/clist/get'); for (const [k, v] of Object.entries({ pn: String(p), pz: '100', po: '1', np: '1', fltt: '2', invt: '2', fid: 'f20', fs: 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23', fields: 'f12,f14,f2,f3,f20' })) u.searchParams.set(k, v); return u; };
  const t = Date.now();
  const res = await Promise.all(Array.from({ length: 8 }, (_, i) => fetch(mk(i + 1), { headers: { 'User-Agent': 'UpUp-Pi-Market-Data/1.0' } })));
  log(`4. 8 RAW concurrent fetches to the mirror host: ${res.filter((r) => r.ok).length}/8 ok in ${Date.now() - t}ms`);
}
// 5. Bun.hash vs node crypto (warmed + interleaved; cold single-shot drifts 3x~72x)
{
  const buf = Buffer.alloc(200 * 1024, 7);
  const { createHash } = await import('node:crypto');
  const A = () => { Bun.hash(buf); };
  const B = () => { createHash('sha256').update(buf).digest('hex'); };
  for (let i = 0; i < 100; i += 1) { A(); B(); }
  let ta = 0, tb = 0;
  const n = 300;
  for (let i = 0; i < n; i += 1) {
    let t = performance.now(); A(); ta += performance.now() - t;
    t = performance.now(); B(); tb += performance.now() - t;
  }
  ta /= n; tb /= n;
  log(`5. hash 200KB (warmed, interleaved x${n}): Bun.hash ${ta.toFixed(4)}ms vs node sha256 ${tb.toFixed(4)}ms (${(tb / ta).toFixed(1)}x)`);
}
console.log(out.join('\n'));
appendFileSync('/tmp/upup-perf/verified.txt', out.join('\n') + '\n');
process.exit(0);
