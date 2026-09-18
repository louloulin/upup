import { resetHostGates, hostGateFor, isHostThrottleError } from '../../packages/pi-observability/src/host-request-gate';
const mk = (host: string) => hostGateFor(`https://${host}/api/x`);
const fail = (host: string) => mk(host).run(async () => { throw new TypeError('The socket connection was closed unexpectedly'); });
const ok = (host: string) => mk(host).run(async () => 'OK');

console.log('A. fail, fail -> ?');
resetHostGates();
for (const [i, f] of [[1, fail], [2, fail]] as const) {
  try { await f('c1.example.com'); console.log(`   #${i} OK`); } catch (e) { console.log(`   #${i} ${(e as Error).name} throttle=${isHostThrottleError(e)}`); }
}
try { await ok('c1.example.com'); console.log('   healthy-after: OK'); } catch (e) { console.log(`   healthy-after: ${(e as Error).name}`); }

console.log('B. fail, OK, fail -> ? (does an intervening success reset the counter)');
resetHostGates();
const seq: [string, (h: string) => Promise<unknown>][] = [['fail', fail], ['ok', ok], ['fail', fail], ['fail', fail]];
for (const [label, fn] of seq) {
  try { await fn('c2.example.com'); console.log(`   ${label}: OK`); } catch (e) { console.log(`   ${label}: ${(e as Error).name} throttle=${isHostThrottleError(e)}`); }
}

console.log('C. two DIFFERENT paths on the same host, one reset each -> ?');
resetHostGates();
for (const p of ['/api/qt/clist/get', '/api/qt/stock/get']) {
  try { await hostGateFor(`https://c3.example.com${p}`).run(async () => { throw new TypeError('The socket connection was closed unexpectedly'); }); }
  catch (e) { console.log(`   ${p}: ${(e as Error).name} throttle=${isHostThrottleError(e)}`); }
}
try { await hostGateFor('https://c3.example.com/api/qt/stock/get').run(async () => 'OK'); console.log('   healthy path after: OK'); }
catch (e) { console.log(`   healthy path after: ${(e as Error).name} throttle=${isHostThrottleError(e)} retryAfter=${(e as any).retryAfterMs}`); }
