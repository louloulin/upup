#!/usr/bin/env bun
/**
 * Real `/invest 600519.SH` end-to-end run — same code path as the TUI
 * slash command: app.getInvestmentWorkflow().runInvest() →
 *   runInvestmentWorkflow → 5 phases (detect / plan / execute / verify / report)
 *   using the canonical Pi session factory + minimax provider.
 */
import { getPiNativeApp } from '@upup/pi-app/default';

const app = getPiNativeApp();
app.initialize();

const workflow = app.getInvestmentWorkflow();
const result = await workflow.runInvest('600519.SH 估值与基本面分析');
console.log(result);

app.dispose();
