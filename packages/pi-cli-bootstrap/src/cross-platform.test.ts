import { describe, expect, test } from 'bun:test';
import {
  formatInvestCommand,
  formatSopCommand,
  type UpUpInvestRequest,
  type UpUpSopRequest,
} from './cross-platform';

describe('cross-platform slash-command formatters', () => {
  test('formatInvestCommand — minimal request is just `/invest <TICKER>`', () => {
    expect(formatInvestCommand({ ticker: '600519.SH' } satisfies UpUpInvestRequest))
      .toBe('/invest 600519.SH');
  });

  test('formatInvestCommand — adds `--sop` when supplied', () => {
    expect(formatInvestCommand({ ticker: '00700.HK', sop: 'debate' } satisfies UpUpInvestRequest))
      .toBe('/invest --sop debate 00700.HK');
  });

  test('formatInvestCommand — adds `--market` when supplied and not `any`', () => {
    expect(formatInvestCommand({ ticker: 'AAPL', sop: 'graham', market: 'us' } satisfies UpUpInvestRequest))
      .toBe('/invest --sop graham --market us AAPL');
  });

  test('formatInvestCommand — `market: any` is omitted (matches `--sop <id>` shorthand)', () => {
    expect(formatInvestCommand({ ticker: 'AAPL', market: 'any' } satisfies UpUpInvestRequest))
      .toBe('/invest AAPL');
  });

  test('formatSopCommand — bare SOP run', () => {
    expect(formatSopCommand({ sop: 'morning-brief' } satisfies UpUpSopRequest))
      .toBe('/sop run morning-brief');
  });

  test('formatSopCommand — passes extra args verbatim', () => {
    expect(formatSopCommand({ sop: 'portfolio-review', args: ['--window', '7d'] } satisfies UpUpSopRequest))
      .toBe('/sop run portfolio-review --window 7d');
  });
});
