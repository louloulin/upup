import { getPiNativeApp } from '@upup/pi-app/default';
import { runGatewayCli } from '@upup/gateway';

void runGatewayCli({ runtime: getPiNativeApp().getGatewayRuntime() });
