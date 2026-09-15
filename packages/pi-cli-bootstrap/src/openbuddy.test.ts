import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runOpenBuddyCommand } from './openbuddy';

const HERMETIC_ENV = (overrides: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  ...overrides,
});

function withTempHome<T>(run: (home: string) => T): T {
  const home = mkdtempSync(join(tmpdir(), 'upup-openbuddy-'));
  try {
    return run(home);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

function makePiAgentDir(home: string, opts: { withSettings?: boolean; withThemes?: string[] } = {}): string {
  const piAgent = join(home, '.pi', 'agent');
  mkdirSync(join(piAgent, 'themes'), { recursive: true });
  if (opts.withSettings !== false) {
    writeFileSync(
      join(piAgent, 'settings.json'),
      JSON.stringify({
        defaultProvider: 'anthropic',
        defaultModel: 'claude-sonnet-4-5',
        packages: ['npm:@some/pkg', 'git:https://github.com/x/y.git'],
      }, null, 2),
    );
  }
  for (const theme of opts.withThemes ?? ['dark.json', 'light.json']) {
    writeFileSync(join(piAgent, 'themes', theme), JSON.stringify({ name: theme, colors: {} }));
  }
  return piAgent;
}

function makeOpenBuddyAgentDir(home: string): string {
  const openBuddy = join(home, '.openbuddy', 'agent');
  mkdirSync(join(openBuddy, 'themes'), { recursive: true });
  writeFileSync(
    join(openBuddy, 'settings.json'),
    JSON.stringify({
      defaultProvider: 'openbuddy-legacy',
      packages: ['npm:@legacy/ob-pkg'],
    }, null, 2),
  );
  return openBuddy;
}

describe('@upup/pi-cli-bootstrap — runOpenBuddyCommand', () => {
  test('status: prints source/target summary', () => {
    withTempHome((home) => {
      makePiAgentDir(home);
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: unknown) => { logs.push(String(msg)); };
      try {
        const result = runOpenBuddyCommand({ command: 'status', args: [], env: HERMETIC_ENV(), home });
        expect(result.exitCode).toBe(0);
        expect(logs.some((l) => l.includes('.pi/agent'))).toBe(true);
        expect(logs.some((l) => l.includes('.upup/agent'))).toBe(true);
      } finally {
        console.log = originalLog;
      }
    });
  });

  test('status: returns 1 when no source agent dir exists', () => {
    withTempHome((home) => {
      const result = runOpenBuddyCommand({ command: 'status', args: [], env: HERMETIC_ENV(), home });
      expect(result.exitCode).toBe(1);
    });
  });

  test('migrate: copies settings.json and themes into ~/.upup/agent', () => {
    withTempHome((home) => {
      makePiAgentDir(home);
      const result = runOpenBuddyCommand({ command: 'migrate', args: [], env: HERMETIC_ENV(), home });
      expect(result.exitCode).toBe(0);
      const target = join(home, '.upup', 'agent');
      expect(existsSync(join(target, 'settings.json'))).toBe(true);
      expect(existsSync(join(target, 'themes', 'dark.json'))).toBe(true);
      expect(existsSync(join(target, 'themes', 'light.json'))).toBe(true);
      const migrated = JSON.parse(readFileSync(join(target, 'settings.json'), 'utf8')) as { defaultProvider?: string; packages?: unknown[] };
      expect(migrated.defaultProvider).toBe('anthropic');
      expect(migrated.packages?.length).toBe(2);
    });
  });

  test('status: picks ~/.openbuddy/agent as legacy source when ~/.pi/agent is absent', () => {
    withTempHome((home) => {
      makeOpenBuddyAgentDir(home);
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: unknown) => { logs.push(String(msg)); };
      try {
        const result = runOpenBuddyCommand({ command: 'status', args: [], env: HERMETIC_ENV(), home });
        expect(result.exitCode).toBe(0);
        expect(logs.some((l) => l.includes('.openbuddy/agent'))).toBe(true);
      } finally {
        console.log = originalLog;
      }
    });
  });

  test('migrate: ~/.openbuddy/agent legacy source beats resolveAgentDir() result', () => {
    withTempHome((home) => {
      makeOpenBuddyAgentDir(home);
      const result = runOpenBuddyCommand({ command: 'migrate', args: [], env: HERMETIC_ENV(), home });
      expect(result.exitCode).toBe(0);
      const target = join(home, '.upup', 'agent');
      const migrated = JSON.parse(readFileSync(join(target, 'settings.json'), 'utf8')) as { defaultProvider?: string; packages?: unknown[] };
      expect(migrated.defaultProvider).toBe('openbuddy-legacy');
      expect(migrated.packages?.length).toBe(1);
    });
  });

  test('migrate --dry-run does not touch the filesystem', () => {
    withTempHome((home) => {
      makePiAgentDir(home);
      const result = runOpenBuddyCommand({ command: 'migrate', args: ['--dry-run'], env: HERMETIC_ENV(), home });
      expect(result.exitCode).toBe(0);
      expect(existsSync(join(home, '.upup', 'agent', 'settings.json'))).toBe(false);
    });
  });

  test('migrate --force overwrites existing target settings.json', () => {
    withTempHome((home) => {
      const piAgent = makePiAgentDir(home);
      const target = join(home, '.upup', 'agent');
      mkdirSync(join(target, 'themes'), { recursive: true });
      writeFileSync(join(target, 'settings.json'), JSON.stringify({ defaultProvider: 'openai' }));
      const result = runOpenBuddyCommand({ command: 'migrate', args: ['--force'], env: HERMETIC_ENV(), home });
      expect(result.exitCode).toBe(0);
      const migrated = JSON.parse(readFileSync(join(target, 'settings.json'), 'utf8')) as { defaultProvider?: string };
      expect(migrated.defaultProvider).toBe('anthropic');
    });
  });

  test('migrate: without --force skips existing target files', () => {
    withTempHome((home) => {
      const piAgent = makePiAgentDir(home);
      const target = join(home, '.upup', 'agent');
      mkdirSync(join(target, 'themes'), { recursive: true });
      writeFileSync(join(target, 'settings.json'), JSON.stringify({ defaultProvider: 'openai' }));
      const result = runOpenBuddyCommand({ command: 'migrate', args: [], env: HERMETIC_ENV(), home });
      expect(result.exitCode).toBe(0);
      const migrated = JSON.parse(readFileSync(join(target, 'settings.json'), 'utf8')) as { defaultProvider?: string };
      expect(migrated.defaultProvider).toBe('openai');
    });
  });

  test('migrate: respects UPUP_MIGRATE_FROM override', () => {
    withTempHome((home) => {
      const custom = mkdtempSync(join(tmpdir(), 'upup-custom-source-'));
      try {
        writeFileSync(join(custom, 'settings.json'), JSON.stringify({ defaultProvider: 'minimax' }));
        const result = runOpenBuddyCommand({
          command: 'migrate',
          args: [],
          env: HERMETIC_ENV({ UPUP_MIGRATE_FROM: custom }),
          home,
        });
        expect(result.exitCode).toBe(0);
        const target = join(home, '.upup', 'agent');
        const migrated = JSON.parse(readFileSync(join(target, 'settings.json'), 'utf8')) as { defaultProvider?: string };
        expect(migrated.defaultProvider).toBe('minimax');
      } finally {
        rmSync(custom, { recursive: true, force: true });
      }
    });
  });

  test('verify: passes when target is fully populated', () => {
    withTempHome((home) => {
      makePiAgentDir(home);
      runOpenBuddyCommand({ command: 'migrate', args: [], env: HERMETIC_ENV(), home });
      const result = runOpenBuddyCommand({ command: 'verify', args: [], env: HERMETIC_ENV(), home });
      expect(result.exitCode).toBe(0);
    });
  });

  test('verify: fails when target missing', () => {
    withTempHome((home) => {
      const result = runOpenBuddyCommand({ command: 'verify', args: [], env: HERMETIC_ENV(), home });
      expect(result.exitCode).toBe(1);
    });
  });

  test('help: prints usage and returns 0', () => {
    withTempHome((home) => {
      const result = runOpenBuddyCommand({ command: 'help', args: [], env: HERMETIC_ENV(), home });
      expect(result.exitCode).toBe(0);
    });
  });

  test('unknown subcommand: returns 1', () => {
    withTempHome((home) => {
      const result = runOpenBuddyCommand({ command: 'banana', args: [], env: HERMETIC_ENV(), home });
      expect(result.exitCode).toBe(1);
    });
  });
});
