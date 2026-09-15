#!/usr/bin/env bun
import { getPiNativeApp } from '@upup/pi-app/default';
import { runEvaluationCli } from './run';

const app = getPiNativeApp();
await runEvaluationCli(app.getEventStream(), app.getPromptRunner(), process.argv.slice(2)).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
