import { HostThrottleError } from '../../packages/pi-observability/src/host-request-gate';
import { classifyProviderError } from '../../packages/pi-observability/src/provider-retry';
for (const e of [
  new HostThrottleError('push2delay.eastmoney.com', 180000),
  new TypeError('The socket connection was closed unexpectedly'),
]) {
  console.log(`${(e as Error).name}: ${JSON.stringify(classifyProviderError(e))}`);
}
