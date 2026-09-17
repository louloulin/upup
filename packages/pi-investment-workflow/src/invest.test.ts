import { describe, expect, test } from 'bun:test';
import { runInvest } from './invest';
import { INVESTMENT_PROFILES } from './agent-spec';

// ---------------------------------------------------------------------------
// SOP integration: /invest --sops and /invest --sop <id> <ticker>
// ---------------------------------------------------------------------------

describe('runInvest SOP integration', () => {
  test('--sops lists built-in SOPs with validation status', async () => {
    const out = await runInvest('--sops');
    expect(out).toContain('Available SOPs');
    for (const id of ['graham', 'momentum', 'debate', 'morning-brief', 'portfolio-review']) {
      expect(out).toContain(id);
    }
    expect(out).toContain('[builtin]');
  });

  test('--sop with unknown id reports the available ids', async () => {
    const out = await runInvest('--sop does-not-exist AAPL');
    expect(out).toContain('未知 SOP: does-not-exist');
    expect(out).toContain('graham');
  });

  test('--sop without a session factory fails closed with an actionable message', async () => {
    const out = await runInvest('--sop graham 600519.SH');
    expect(out).toContain('需要 Pi session 工厂');
  });

  test('--sop=<id> flag form is accepted', async () => {
    const out = await runInvest('--sop=momentum 00700.HK');
    // No factory injected here either, so the SOP is resolved first and only
    // then does the runner gate trip.
    expect(out).toContain('SOP "momentum"');
  });

  test('--sop uses a Pi-backed runner when a session factory is provided', async () => {
    const calls: string[] = [];
    const fakeSession = {
      id: 'sess-1',
      spec: INVESTMENT_PROFILES['invest-explore']!,
      async prompt(input: string) { calls.push(input); },
      setFinanceContext() {},
      getMessages() { return [{ role: 'assistant', content: [{ type: 'text', text: 'phase output' }] }]; },
      dispose() {},
    };
    const sessionFactory = async () => fakeSession as never;
    const out = await runInvest('--sop morning-brief 600519.SH', { sessionFactory });
    expect(calls.length).toBe(2); // detect + report
    expect(calls[0]).toContain('600519.SH');
    expect(out).toContain('盘前晨报');
    expect(out).toContain('phase output');
  });
});

describe('SOP phase failure surfacing', () => {
  const makeSession = (payload: Record<string, unknown>) => ({
    id: 'sess-x',
    spec: INVESTMENT_PROFILES['invest-explore']!,
    async prompt() {},
    setFinanceContext() {},
    getMessages() { return [payload]; },
    dispose() {},
  });

  test('a provider error surfaces as a failed phase, not an empty success', async () => {
    const sessionFactory = (async () => makeSession({
      role: 'assistant',
      content: [],
      stopReason: 'error',
      errorMessage: '429 rate_limit_error: token plan exhausted',
    })) as never;
    const out = await runInvest('--sop morning-brief 600519.SH', { sessionFactory });
    expect(out).toContain('✗');
    expect(out).toContain('429');
    expect(out).toContain('成功: no');
    expect(out).not.toContain('成功: yes');
  });

  test('an empty assistant reply without an error is still a failed phase', async () => {
    const sessionFactory = (async () => makeSession({ role: 'assistant', content: [] })) as never;
    const out = await runInvest('--sop morning-brief 600519.SH', { sessionFactory });
    expect(out).toContain('returned no output');
    expect(out).toContain('成功: no');
  });

  test('stopReason=error without errorMessage still fails', async () => {
    const sessionFactory = (async () => makeSession({ role: 'assistant', content: [], stopReason: 'error' })) as never;
    const out = await runInvest('--sop morning-brief 600519.SH', { sessionFactory });
    expect(out).toContain('model request failed');
    expect(out).toContain('成功: no');
  });
});

describe('runInvest --sop-dynamic', () => {
  test('parseInvestArgs sets engine=dynamic for --sop-dynamic', async () => {
    const { parseInvestArgs } = await import('./invest');
    const args = parseInvestArgs('--sop-dynamic graham 600519.SH');
    expect(args.mode).toBe('sop');
    expect(args.sopId).toBe('graham');
    expect(args.ticker).toBe('600519.SH');
    expect(args.engine).toBe('dynamic');
  });

  test('parseInvestArgs keeps the legacy engine for --sop', async () => {
    const { parseInvestArgs } = await import('./invest');
    const args = parseInvestArgs('--sop graham 600519.SH');
    expect(args.engine).toBeUndefined();
    expect(args.sopId).toBe('graham');
  });

  test('--sop-dynamic rejects an unknown SOP id the same way --sop does', async () => {
    const { runInvest } = await import('./invest');
    const sessionFactory = (async () => makeSession({ role: 'assistant', content: [] })) as never;
    const out = await runInvest('--sop-dynamic nonexistent-sop AAPL', { sessionFactory });
    expect(out).toContain('未知 SOP');
  });
});
