import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const productionEntryImports: Record<string, readonly string[]> = {
  'packages/pi-app/src/print.ts': ['./default.js'],
  'packages/pi-tui-app/src/tui/agent-runner.ts': ['@upup/pi-runtime'],
  'packages/gateway/src/agent-runner.ts': ['GatewayAgentRuntimePort'],
  'packages/cron/src/executor.ts': ['@upup/gateway'],
  'packages/daemon/src/workers/tasks.ts': ['@upup/gateway'],
  'packages/pi-bridge/src/server.ts': ['@upup/gateway'],
  'packages/pi-stdio/src/server.ts': ['@upup/pi-event-adapter', '@upup/pi-session'],
  'packages/pi-evals/src/cli.ts': ['@upup/pi-app/default', './run.js'],
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
    expect(readFileSync(join(process.cwd(), 'packages/pi-prompt-config/src/capability-manifest.ts'), 'utf8')).not.toContain('tools/registry');
  });

  test('CLI Skill execution stays on the Pi ResourceLoader path', () => {
    for (const file of ['packages/pi-tui-app/src/cli.ts']) {
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
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/\b(?:loadAndStartPlugin|stopAndUnloadPlugin|registerAllAdapters|discoverPlugins)\s*\(/);
    }
  });

  test('Pi Package extensions are the default tool source', () => {
    const source = readFileSync(join(process.cwd(), 'packages/pi-session/src/agent-session-factory.ts'), 'utf8');
    expect(source).toContain('const sourceTools: readonly UpUpToolContract[] = options.tools ?? []');
    expect(source).not.toContain('registry-adapter');
    expect(source).not.toContain('loadRegisteredTools');
  });

  test('prompt composition and AgentSpec validation stay in public contracts', () => {
    const factory = readFileSync(join(process.cwd(), 'packages/pi-session/src/agent-session-factory.ts'), 'utf8');
    const runner = readFileSync(join(process.cwd(), 'packages/pi-session/src/prompt-runner.ts'), 'utf8');
    expect(factory).toContain('@upup/pi-prompt-config');
    expect(factory).not.toContain('You are UpUp, a Chinese-language financial research assistant');
    expect(runner).toContain("from '@upup/pi-runtime'");
    expect(runner).not.toContain("from '@upup/pi-investment-workflow'");
  });

  test('Session Factory consumes the composition boundary, not concrete business packages', () => {
    const source = readFileSync(join(process.cwd(), 'packages/pi-session/src/agent-session-factory.ts'), 'utf8');
    for (const forbidden of ['@upup/pi-finance-composition', '@upup/pi-platform-composition', '@upup/pi-market-data', "from '@upup/cron'"]) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).toContain('./builtin-composition.js');
    expect(readFileSync(join(process.cwd(), 'packages/pi-session/src/index.ts'), 'utf8')).toContain('PiSessionCompositionProviders');
  });

  test('PiApp default bootstrap wires builtin session composition into the session runtime factory', () => {
    const source = readFileSync(join(process.cwd(), 'packages/pi-app/src/default.ts'), 'utf8');
    const usesCombinedProvider = source.includes('sessionCompositionProvider: builtinSessionComposition');
    const usesSplitProviders = source.includes('sessionFinanceProvider: builtinSessionFinanceComposition')
      && source.includes('sessionPlatformProvider: builtinSessionPlatformComposition');
    expect(usesCombinedProvider || usesSplitProviders).toBe(true);
    expect(source).toContain('createPiAgentRuntime(composition');
    const piAppIndex = readFileSync(join(process.cwd(), 'packages/pi-app/src/index.ts'), 'utf8');
    expect(piAppIndex).toContain('sessionCompositionProvider');
    expect(piAppIndex).toContain('sessionFinanceProvider');
    expect(piAppIndex).toContain('sessionPlatformProvider');
    expect(piAppIndex).toContain('PiSessionCompositionProviders');
    expect(piAppIndex).toContain('getSessionCompositionProvider');
  });

  test('Pi prompt capability discovery does not import the legacy root registry', () => {
    const manifest = readFileSync(join(process.cwd(), 'packages/pi-prompt-config/src/capability-manifest.ts'), 'utf8');
    const prompts = readFileSync(join(process.cwd(), 'packages/pi-prompt-config/src/capability-manifest.ts'), 'utf8');
    expect(manifest).not.toContain('tools/registry');
    expect(prompts).not.toContain('tools/registry');
    expect(manifest).toContain('availableToolNames');
    expect(prompts).toContain('availableToolNames');
  });
  test('PiSessionAdapter is the only production subscribe path with session_start synthesis', () => {
    // The session_start synthesis contract MUST live in PiSessionAdapter.
    // No production entry adapter may re-implement subscribe or build a
    // parallel session event channel.
    const adapter = readFileSync(join(process.cwd(), 'packages/pi-session/src/index.ts'), 'utf8');
    expect(adapter).toMatch(/subscribe\(listener[^)]*\)[^{]*\{[\s\S]*listener\(\{\s*type:\s*'session_start'/);
    // No production entry adapter may define its own subscribe() that bypasses
    // PiSessionAdapter or that omits the synthesized session_start.
    const productionAdapters = [
      'packages/pi-tui-app/src/tui/agent-runner.ts',
      'packages/gateway/src/agent-runner.ts',
      'packages/pi-stdio/src/server.ts',
      'packages/pi-bridge/src/server.ts',
      'packages/cron/src/executor.ts',
      'packages/daemon/src/workers/tasks.ts',
      'packages/pi-evals/src/cli.ts',
    ];
    for (const file of productionAdapters) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      // Must NOT define its own subscribe() that bypasses PiSessionAdapter.
      expect(source).not.toMatch(/\bsubscribe\s*\([^)]*\)\s*\{[^}]*session_start/);
      // Must NOT define its own listener = next pattern that synthesizes events.
      expect(source).not.toMatch(/listener\s*=\s*next[\s\S]*session_start/);
    }
  });

  test('PiSessionAdapter source file exposes subscribe + session_start synthesis as the single contract', () => {
    const adapter = readFileSync(join(process.cwd(), 'packages/pi-session/src/index.ts'), 'utf8');
    // Contract anchors: there is exactly one place that calls
    // `listener({ type: 'session_start', ... })` and that place is the
    // `subscribe(listener)` method of PiSessionAdapter.
    const matches = adapter.match(/listener\(\{\s*type:\s*'session_start'/g) ?? [];
    expect(matches.length).toBe(1);
    // The class field `listeners = new Set` must be private and exactly one.
    const listenerSetMatches = adapter.match(/listeners\s*=\s*new Set/g) ?? [];
    expect(listenerSetMatches.length).toBeGreaterThanOrEqual(1);
    // The subscribe signature must accept a single listener and return an unsubscribe function.
    expect(adapter).toMatch(/subscribe\(listener: \(event: UpUpAgentEvent\) => void\): \(\) => void/);
  });
});
