#!/usr/bin/env bun
// Bypass the CLI binary and call runInvest() directly through the same
// code path as `upup invest` does — through `app.getInvestmentWorkflow()`.
import { getPiNativeApp } from '@upup/pi-app/default';

const app = getPiNativeApp();
const workflow = app.getInvestmentWorkflow();

console.log('=== running /invest 600519.SH through app.getInvestmentWorkflow() ===');
const output = await workflow.runInvest('600519.SH 估值与基本面分析');
console.log(output);

app.dispose();
