// @ts-nocheck
/**
 * Tests for the 9 Pi-native investment commands added to ALL_COMMANDS.
 *
 * These tests verify that the command registry correctly:
 *   1. Loads all 9 new investment commands (invest, morning-brief, earnings-preview,
 *      risk-dashboard, portfolio-review, watchlist-edit, dossier, screen, strategy)
 *   2. Exposes them in the slash autocompletion source (`getAllSlashCommands`)
 *   3. Resolves their aliases through `ALIAS_TO_COMMAND`
 *   4. Wires their descriptions through the LocalCommand contract type
 *
 * The commands themselves delegate to `@upup/pi-investment-workflow`'s
 * `runInvest` / `runInvestmentCommand` — these tests do NOT invoke the
 * workflow (covered by `pi-investment-workflow/src/registry.test.ts`),
 * only the command-registry surface.
 */

import { describe, expect, test } from 'bun:test';
import {
  ALL_COMMANDS,
  ALIAS_TO_COMMAND,
  COMMAND_ALIASES,
  findCommand,
  getAllSlashCommands,
} from './all-commands';

const INVESTMENT_COMMAND_NAMES = [
  'invest',
  'morning-brief',
  'earnings-preview',
  'risk-dashboard',
  'portfolio-review',
  'watchlist-edit',
  'dossier',
  'screen',
  'strategy',
] as const;

const INVESTMENT_ALIASES: Readonly<Record<(typeof INVESTMENT_COMMAND_NAMES)[number], readonly string[]>> = {
  invest: ['inv'],
  'morning-brief': ['mb', 'brief'],
  'earnings-preview': ['ep', 'earnings'],
  'risk-dashboard': ['risk', 'rd'],
  'portfolio-review': ['review', 'pr'],
  'watchlist-edit': ['wl', 'watchlist'],
  dossier: ['doss'],
  screen: ['scr'],
  strategy: ['strat'],
};

describe('Pi-native investment commands registry', () => {
  test('ALL_COMMANDS contains all 9 investment commands', () => {
    const names = new Set(ALL_COMMANDS.map(c => c.name));
    for (const name of INVESTMENT_COMMAND_NAMES) {
      expect(names.has(name)).toBe(true);
    }
  });

  test('each investment command has the expected alias set', () => {
    for (const name of INVESTMENT_COMMAND_NAMES) {
      const cmd = findCommand(name);
      expect(cmd).toBeDefined();
      expect(cmd!.name).toBe(name);
      const expectedAliases = new Set(INVESTMENT_ALIASES[name] ?? []);
      const actualAliases = new Set(cmd!.aliases ?? []);
      for (const alias of expectedAliases) {
        expect(actualAliases.has(alias)).toBe(true);
      }
    }
  });

  test('COMMAND_ALIASES exposes every investment command alias', () => {
    for (const [cmd, aliases] of Object.entries(INVESTMENT_ALIASES)) {
      const registered = COMMAND_ALIASES[cmd] ?? [];
      for (const alias of aliases) {
        expect(registered).toContain(alias);
      }
    }
  });

  test('ALIAS_TO_COMMAND resolves every alias to its canonical command name', () => {
    for (const [cmd, aliases] of Object.entries(INVESTMENT_ALIASES)) {
      for (const alias of aliases) {
        expect(ALIAS_TO_COMMAND[alias]).toBe(cmd);
      }
    }
  });

  test('getAllSlashCommands exposes every investment command to TUI autocomplete', () => {
    const slashNames = new Set(getAllSlashCommands().map(c => c.name));
    for (const name of INVESTMENT_COMMAND_NAMES) {
      expect(slashNames.has(name)).toBe(true);
    }
  });

  test('investment commands carry Pi-native descriptions mentioning workflow phases', () => {
    const invest = findCommand('invest');
    expect(invest).toBeDefined();
    expect(invest!.description).toMatch(/detect.*plan.*execute.*verify.*report/);
    expect(invest!.description.toLowerCase()).toContain('pi');
  });

  test('all 9 investment commands are LocalCommand (not prompt or local-jsx)', () => {
    for (const name of INVESTMENT_COMMAND_NAMES) {
      const cmd = findCommand(name);
      expect(cmd).toBeDefined();
      expect(cmd!.type).toBe('local');
    }
  });

  test('every investment command is loadable (lazy module import resolves)', async () => {
    for (const name of INVESTMENT_COMMAND_NAMES) {
      const cmd = findCommand(name);
      expect(cmd).toBeDefined();
      const mod = await cmd!.load();
      expect(typeof mod.call).toBe('function');
    }
  });

  test('investment commands return usage help when called with empty args', async () => {
    // The fail-closed path is exercised when `@upup/pi-investment-workflow`
    // cannot be imported (this is rare in CI but we test the safety net).
    // When the package IS importable, the empty-args branch renders usage
    // text. Either way, the return shape is `{ type: 'text', value: ... }`.
    for (const name of INVESTMENT_COMMAND_NAMES) {
      const cmd = findCommand(name);
      const mod = await cmd!.load();
      const result = await mod.call('', {} as any);
      expect(result.type).toBe('text');
      expect(typeof result.value).toBe('string');
      // Empty args → usage help (either because the workflow is unavailable
      // or because we explicitly render help). Both paths return non-empty text.
      expect(result.value.length).toBeGreaterThan(0);
    }
  });
});
