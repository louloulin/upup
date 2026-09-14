import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const productionEntryImports: Record<string, readonly string[]> = {
  'src/print.ts': ['runtime/pi/event-stream'],
  'src/controllers/agent-runner.ts': ['runtime/pi/event-stream'],
  'packages/gateway/src/agent-runner.ts': ['runtime-port'],
  'src/cron/executor.ts': ['@upup/gateway'],
  'src/daemon/workers/tasks.ts': ['runtime/pi/bootstrap'],
  'src/bridge/server.ts': ['@upup/gateway'],
  'src/stdio/server.ts': ['runtime/pi/event-stream'],
  'src/evals/run.ts': ['runtime/pi/event-stream'],
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
    expect(readFileSync(join(process.cwd(), 'src/runtime/pi/prompts.ts'), 'utf8')).not.toMatch(/from ['"](?:\.\.?\/)+'skills/);
  });

  test('CLI Skill execution stays on the Pi ResourceLoader path', () => {
    for (const file of ['src/cli.ts', 'src/commands/unified-registry.ts']) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      expect(source).not.toContain('./skills/executor.js');
      expect(source).not.toContain('./skills/index.js');
      expect(source).not.toContain('../skills/slash-command.js');
    }
  });

  test('legacy Plugin Loader and runtime adapters are not production execution paths', () => {
    const productionFiles = [...new Bun.Glob('src/**/*.{ts,tsx}').scanSync({ cwd: process.cwd(), absolute: true })]
      .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.spec.ts') && !file.includes('/src/plugins/'));
    for (const file of productionFiles) {
      if (file.endsWith('/src/runtime/pi/plugin-adapter.ts')) continue;
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/\b(?:loadAndStartPlugin|stopAndUnloadPlugin|registerAllAdapters|discoverPlugins)\s*\(/);
    }
  });

  test('Pi Package extensions are the default tool source', () => {
    const source = readFileSync(join(process.cwd(), 'src/runtime/pi/agent-session-factory.ts'), 'utf8');
    expect(source).toContain('const sourceTools: readonly UpUpToolContract[] = options.tools ?? []');
    expect(source).not.toContain('registry-adapter');
    expect(source).not.toContain('loadRegisteredTools');
  });

  test('Pi prompt capability discovery does not import the legacy root registry', () => {
    const manifest = readFileSync(join(process.cwd(), 'src/runtime/pi/capability-manifest.ts'), 'utf8');
    const prompts = readFileSync(join(process.cwd(), 'src/runtime/pi/prompts.ts'), 'utf8');
    expect(manifest).not.toContain('tools/registry');
    expect(prompts).not.toContain('tools/registry');
    expect(manifest).toContain('availableToolNames');
    expect(prompts).toContain('availableTools');
  });
});
