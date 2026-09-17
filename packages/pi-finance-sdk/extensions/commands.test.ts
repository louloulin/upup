import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_FINANCE_COMMAND_CATALOG,
  PI_FINANCE_COMMANDS,
  registerPiFinanceCommands,
  setPiFinanceCommandRunners,
} from './commands';

interface CapturedCommand {
  readonly description?: string;
  readonly handler: (args: string) => Promise<void>;
}

function fakePi() {
  const commands = new Map<string, CapturedCommand>();
  const entries: Array<{ type: string; data: Record<string, unknown> }> = [];
  const messages: string[] = [];
  return {
    commands,
    entries,
    messages,
    pi: {
      registerCommand: (name: string, options: CapturedCommand) => {
        commands.set(name, options);
      },
      appendEntry: (type: string, data: Record<string, unknown>) => {
        entries.push({ type, data });
      },
      sendUserMessage: (text: string) => {
        messages.push(text);
      },
    },
  };
}

const CANONICAL = ['invest', 'dossier', 'strategy', 'risk-dashboard', 'portfolio-review', 'morning-brief', 'earnings-preview', 'watchlist-edit', 'screen', 'sop'];

describe('pi-finance-sdk investment commands → Pi registerCommand', () => {
  test('default catalog covers every canonical investment command + alias', () => {
    expect(DEFAULT_FINANCE_COMMAND_CATALOG.map((entry) => entry.name).sort()).toEqual([...CANONICAL].sort());
    expect([...PI_FINANCE_COMMANDS].sort()).toEqual([...CANONICAL].sort());
    const registered = registerPiFinanceCommands(fakePi().pi);
    for (const name of CANONICAL) expect(registered).toContain(name);
    // Legacy aliases from the deleted @upup/commands registry keep working.
    for (const alias of ['inv', 'doss', 'strat', 'risk', 'review', 'pr', 'mb', 'brief', 'ep', 'earnings', 'wl', 'watchlist', 'scr']) {
      expect(registered).toContain(alias);
    }
  });

  test('injected catalog from the workflow registry wins (single source of truth)', () => {
    setPiFinanceCommandRunners({
      commands: [{ name: 'invest', aliases: ['i'], description: 'injected' }],
    });
    try {
      const registered = registerPiFinanceCommands(fakePi().pi);
      expect(registered).toEqual(['invest', 'i']);
    } finally {
      setPiFinanceCommandRunners({});
    }
  });

  test('/invest dispatches the invest runner and records an auditable pair of entries', async () => {
    setPiFinanceCommandRunners({ invest: async (args) => `plan for ${args}` });
    try {
      const { pi, commands, entries, messages } = fakePi();
      registerPiFinanceCommands(pi);
      await commands.get('invest')!.handler('600519.SH');
      expect(entries.map((entry) => entry.type)).toEqual(['upup_finance_command', 'upup_finance_command_result']);
      expect(entries[1]!.data.ok).toBe(true);
      expect(messages[0]).toContain('plan for 600519.SH');
    } finally {
      setPiFinanceCommandRunners({});
    }
  });

  test('non-invest commands dispatch the generic runner by canonical name', async () => {
    const seen: Array<[string, string]> = [];
    setPiFinanceCommandRunners({ generic: async (name, args) => { seen.push([name, args]); return `dossier ${args}`; } });
    try {
      const { pi, commands } = fakePi();
      registerPiFinanceCommands(pi);
      // Alias `/doss` must dispatch the canonical `dossier` name.
      await commands.get('doss')!.handler('AAPL');
      expect(seen).toEqual([['dossier', 'AAPL']]);
    } finally {
      setPiFinanceCommandRunners({});
    }
  });

  test('missing runner is fail-closed and audited', async () => {
    setPiFinanceCommandRunners({});
    try {
      const { pi, commands, entries, messages } = fakePi();
      registerPiFinanceCommands(pi);
      await commands.get('screen')!.handler('PE<15');
      expect(entries[1]!.data.ok).toBe(false);
      expect(messages[0]).toContain('unavailable');
    } finally {
      setPiFinanceCommandRunners({});
    }
  });
});
