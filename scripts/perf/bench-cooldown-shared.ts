import { resetHostGates, hostGateFor, isHostThrottleError } from '../../packages/pi-observability/src/host-request-gate';
resetHostGates();
const host = 'https://cooldown.example.com/api/qt/stock/get';

const probe = async (label: string, fail: boolean) => {
  try {
    const r = await hostGateFor(host).run(async () => {
      if (fail) throw new TypeError('The socket connection was closed unexpectedly');
      return 'OK';
    });
    console.log(`  ${label}: ${r}`);
  } catch (e) {
    console.log(`  ${label}: ${(e as Error).name}${isHostThrottleError(e) ? ' (throttle)' : ''}`);
  }
};

console.log('Two UNRELATED requests each fail once (different logical callers, same host):');
await probe('caller-A (fails)', true);
await probe('caller-B (would succeed, but 2nd reset armed cooldown)', true);
console.log('Now a completely healthy request to the SAME host:');
await probe('caller-C (healthy, unrelated query)', false);
await probe('caller-D (healthy, unrelated query)', false);
console.log(`  gate.retryAfterMs() = ${hostGateFor(host).retryAfterMs()}ms`);
