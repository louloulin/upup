#!/usr/bin/env bun
import { getPiNativeApp } from '@upup/pi-app/default';

const app = getPiNativeApp();
const workflow = app.getInvestmentWorkflow();
const sessionFactory = app.getInvestmentWorkflow().sessionFactory;

console.log('opening workflow session...');
const session = await sessionFactory('/tmp/test-invest-debug-workflow.jsonl');
console.log('session id:', session.id);

try {
  const result = await session.executeTool('invest_workflow_phase', `${session.id}:test:plan`, {
    phase: 'plan',
    ticker: 'TEST',
    goal: 'test',
  });
  console.log('result:', JSON.stringify(result).slice(0, 600));
} catch (e) {
  console.log('error:', e instanceof Error ? e.message : String(e));
}
