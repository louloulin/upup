import { resetHostGates, hostGateFor } from '../../packages/pi-observability/src/host-request-gate';
const mk = (p: number) => { const u = new URL('https://push2delay.eastmoney.com/api/qt/clist/get'); for (const [k, v] of Object.entries({ pn: String(p), pz: '100', po: '1', np: '1', fltt: '2', invt: '2', fid: 'f20', fs: 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23', fields: 'f12,f14,f2,f3,f20' })) u.searchParams.set(k, v); return u; };
const req = (p: number) => () => fetch(mk(p), { headers: { 'User-Agent': 'UpUp-Pi-Market-Data/1.0' } });

for (let round = 1; round <= 2; round += 1) {
  resetHostGates();
  const t1 = Date.now();
  await Promise.all(Array.from({ length: 5 }, (_, i) => hostGateFor(mk(i + 1)).run(req(i + 1))));
  const gated = Date.now() - t1;
  await new Promise((r) => setTimeout(r, 1200));
  const t2 = Date.now();
  const res = await Promise.all(Array.from({ length: 5 }, (_, i) => req(i + 1)()));
  const raw = Date.now() - t2;
  console.log(`round ${round}: gated=${gated}ms  raw=${raw}ms  ratio=${(gated / Math.max(raw, 1)).toFixed(1)}x  rawOk=${res.filter(r => r.ok).length}/5`);
  await new Promise((r) => setTimeout(r, 1200));
}
