#!/usr/bin/env bun
// Simulate what the TUI `/invest` slash command does: invoke the
// `setPiFinanceCommandRunners` invest handler without a sessionFactory.
import { getPiNativeApp } from '@upup/pi-app/default';

const app = getPiNativeApp();
app.initialize();

const { getPiFinanceCommandRunners } = await import('@upup/pi-finance-sdk');
const runners = getPiFinanceCommandRunners();
if (!runners.invest) {
  console.log('no invest runner registered');
  process.exit(1);
}

const output = await runners.invest('600519.SH 估值与基本面分析');
console.log(output);

app.dispose();
