import { resetHostGates } from '../../packages/pi-observability/src/host-request-gate';
const orig = globalThis.fetch;
let n = 0; const log: { t: number; url: string }[] = [];
const t0 = Date.now();
globalThis.fetch = (async (input: any, init?: any) => {
  n += 1;
  const t = Date.now();
  log.push({ t, url: String(input).replace(/^https?:\/\//, '').slice(0, 55) });
  try { return await orig(input, init); }
  catch (e) { log.push({ t: Date.now(), url: 'FAIL ' + String(input).slice(0, 40) }); throw e; }
}) as typeof fetch;

const { querySectorSnapshot } = await import('../../packages/pi-market-data/src/market-structure-eastmoney');
for (const [label, args] of [
  ['no code (board list)', [undefined, 'industry']],
  ['sector keyword 白酒', ['白酒', 'concept']],
  ['stock code 600519.SH', ['600519.SH', 'industry']],
] as const) {
  resetHostGates();
  n = 0; log.length = 0;
  const t = Date.now();
  try { await querySectorSnapshot(args[0] as never, args[1] as never, {}); } catch (e) { console.log('   (err)', (e as Error).message.slice(0, 50)); }
  console.log(`${label.padEnd(24)} ${String(Date.now() - t).padStart(6)}ms  requests=${n}`);
  let prev = t0;
  for (const e of log) { console.log(`      +${String(e.t - prev).padStart(5)}ms  ${e.url}`); prev = e.t; }
}

// Same shape, but against the mirror only (separate gate) to show the ideal.
resetHostGates();
console.log('\nNote: each entry is one gated request; starts are paced 500ms apart.');
process.exit(0);
