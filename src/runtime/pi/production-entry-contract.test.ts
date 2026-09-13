import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const productionEntryImports: Record<string, readonly string[]> = {
  'src/print.ts': ['runtime/pi/event-stream'],
  'src/controllers/agent-runner.ts': ['runtime/pi/event-stream', 'runtime/pi/session-service'],
  'src/gateway/agent-runner.ts': ['runtime/pi/index'],
  'src/cron/executor.ts': ['gateway/agent-runner'],
  'src/daemon/workers/tasks.ts': ['runtime/pi/background-service'],
  'src/bridge/server.ts': ['gateway/agent-runner'],
  'src/stdio/server.ts': ['runtime/pi/event-stream', 'runtime/pi/session-service'],
  'src/evals/run.ts': ['runtime/pi/event-stream'],
  'src/multi-agent/backends/inprocess.ts': ['runtime/pi/index'],
  'src/multi-agent/backends/pi-worker.ts': ['runtime/pi/index'],
};

describe('Pi production entry contract', () => {
  test('removed custom agent entrypoints stay absent', () => {
    for (const file of ['src/agent', 'src/model/llm.ts', 'packages/adapter-paperclip', 'packages/agent-core', 'packages/llm', 'upup-agent']) {
      expect(() => readFileSync(join(process.cwd(), file), 'utf8')).toThrow();
    }
  });

  test('all production entry adapters point to the single Pi runtime boundary', () => {
    for (const [file, requiredImports] of Object.entries(productionEntryImports)) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      for (const requiredImport of requiredImports) expect(source).toContain(requiredImport);
      expect(source).not.toContain("src/agent/agent.js");
      expect(source).not.toContain('callLlmWithMessages');
    }
  });
});
