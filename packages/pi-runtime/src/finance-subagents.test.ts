/**
 * Tests for `registerUpUpFinanceSubagents`.
 *
 * We mock `pi-subagents` via `bun:test`'s `mock.module()` so we can
 * assert the right definitions are passed to `registerAgent` without
 * pulling the real (heavy) subagent runtime into the test. The real
 * `pi-subagents` integration is verified by `check:pi-ecosystem-deps`.
 */

import { afterEach, describe, expect, it, mock } from 'bun:test';
import {
  UPUP_FINANCE_SUBAGENT_DEFAULTS,
  registerUpUpFinanceSubagents,
  type UpUpFinanceSubagentSpec,
} from './finance-subagents';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

interface FakeRegistration { name: string; dispose: () => void }
interface RegisterCall { name: string; definition: { description: string; systemPrompt: string; excludeTools?: readonly string[]; thinking?: string | false; defaultTimeoutMs?: number } }

let registerCalls: RegisterCall[] = [];

afterEach(() => {
  registerCalls = [];
  mock.module('pi-subagents/agents', () => ({
    registerAgent: ({ name, definition }: { name: string; definition: RegisterCall['definition'] }) => {
      registerCalls.push({ name, definition });
      return { dispose: () => undefined };
    },
  }));
});

describe('UPUP_FINANCE_SUBAGENT_DEFAULTS', () => {
  it('contains bull, bear, synthesizer and risk with non-empty prompts', () => {
    const names = UPUP_FINANCE_SUBAGENT_DEFAULTS.map((agent) => agent.name);
    expect(names).toContain('bull');
    expect(names).toContain('bear');
    expect(names).toContain('synthesizer');
    expect(names).toContain('risk');
    for (const spec of UPUP_FINANCE_SUBAGENT_DEFAULTS) {
      expect(spec.description.length).toBeGreaterThan(20);
      expect(spec.systemPrompt.length).toBeGreaterThan(100);
    }
  });

  it('every default excludes financial-write tools', () => {
    const writes = ['place_trade_order', 'cancel_trade_order', 'config_set', 'write_file'];
    for (const spec of UPUP_FINANCE_SUBAGENT_DEFAULTS) {
      const excluded = spec.excludeTools ?? [];
      for (const tool of writes) {
        expect(excluded).toContain(tool);
      }
    }
  });
});

describe('registerUpUpFinanceSubagents', () => {
  it('registers every default subagent on a fake pi', async () => {
    const fakePi = {} as ExtensionAPI;
    const handles = await registerUpUpFinanceSubagents(fakePi);
    expect(handles.length).toBe(UPUP_FINANCE_SUBAGENT_DEFAULTS.length);
    expect(registerCalls.map((c) => c.name).sort()).toEqual(['bear', 'bull', 'risk', 'synthesizer']);
  });

  it('forwards description, systemPrompt and excludeTools to registerAgent', async () => {
    const fakePi = {} as ExtensionAPI;
    await registerUpUpFinanceSubagents(fakePi);
    const bull = registerCalls.find((c) => c.name === 'bull');
    expect(bull).toBeDefined();
    expect(bull?.definition.description).toContain('bullish case');
    expect(bull?.definition.systemPrompt).toContain('bull analyst');
    expect(bull?.definition.excludeTools).toContain('place_trade_order');
  });

  it('returns a dispose handle per registered agent', async () => {
    const fakePi = {} as ExtensionAPI;
    const handles = await registerUpUpFinanceSubagents(fakePi);
    for (const handle of handles) {
      expect(typeof handle.dispose).toBe('function');
      expect(() => handle.dispose()).not.toThrow();
    }
  });

  it('honours a custom agent list (test override)', async () => {
    const fakePi = {} as ExtensionAPI;
    const overrides: readonly UpUpFinanceSubagentSpec[] = [
      {
        name: 'bull',
        description: 'Custom bull',
        systemPrompt: 'Custom bull prompt',
      },
    ];
    const handles = await registerUpUpFinanceSubagents(fakePi, { agents: overrides });
    expect(handles.length).toBe(1);
    expect(handles[0].name).toBe('bull');
  });

  it('reports failure through the sink and keeps the session alive', async () => {
    // Force the registerAgent import to throw on a particular agent.
    mock.module('pi-subagents/agents', () => ({
      registerAgent: ({ name }: { name: string }) => {
        if (name === 'bear') throw new Error('collision with builtin');
        registerCalls.push({ name, definition: { description: '', systemPrompt: '' } });
        return { dispose: () => undefined };
      },
    }));
    const errors: { name: string; error: unknown }[] = [];
    const fakePi = {} as ExtensionAPI;
    const handles = await registerUpUpFinanceSubagents(fakePi, {
      sink: {
        onError: (name, error) => { errors.push({ name, error }); },
      },
    });
    // bull/synthesizer/risk still registered; bear failed.
    expect(handles.length).toBe(UPUP_FINANCE_SUBAGENT_DEFAULTS.length - 1);
    expect(errors.length).toBe(1);
    expect(errors[0].name).toBe('bear');
    expect((errors[0].error as Error).message).toBe('collision with builtin');
  });
});
