/**
 * earnings-3w pipeline tests (P1.a.2)
 *
 * Coverage:
 *  - 3 specs built with the canonical keys (analyst / sentiment / transcript)
 *  - runEarningsPreview3W default runFn produces an EarningsPreview in offline mode
 *  - full group → source = 'partial' (offline has no real data, so partial)
 *  - 1 worker failure → preview still has the other 2 fields populated
 *  - all workers fail → source degrades to 'framework'
 *  - result shape matches P1.a.5 EarningsPreview
 */

import { describe, expect, test } from 'bun:test';
import {
  buildEarningsWorkerSpecs,
  runEarningsPreview3W,
} from './earnings-3w.js';
import type { WorkerRunFn } from './subagent.js';

describe('buildEarningsWorkerSpecs', () => {
  test('produces analyst / sentiment / transcript in order', () => {
    const specs = buildEarningsWorkerSpecs({ ticker: 'NVDA', scheduledAt: 1_700_000_000_000, mode: 'pre' });
    expect(specs.map(s => s.key)).toEqual(['analyst', 'sentiment', 'transcript']);
  });

  test('each spec has a distinct SubagentConfig (tools differ)', () => {
    const specs = buildEarningsWorkerSpecs({ ticker: 'NVDA', scheduledAt: 1_700_000_000_000, mode: 'pre' });
    const tools = specs.map(s => (s.config.tools as string[]).join(','));
    expect(new Set(tools).size).toBe(3);
  });

  test('transcript systemPrompt differs by mode (pre vs post)', () => {
    const pre = buildEarningsWorkerSpecs({ ticker: 'NVDA', scheduledAt: 1_700_000_000_000, mode: 'pre' });
    const post = buildEarningsWorkerSpecs({ ticker: 'NVDA', scheduledAt: 1_700_000_000_000, mode: 'post' });
    const preT = pre.find(s => s.key === 'transcript')!;
    const postT = post.find(s => s.key === 'transcript')!;
    expect(preT.config.systemPrompt).not.toBe(postT.config.systemPrompt);
    expect(preT.config.systemPrompt).toContain('upcoming');
    expect(postT.config.systemPrompt).toContain('most recent');
  });

  test('ticker is uppercased in spec configs', () => {
    const specs = buildEarningsWorkerSpecs({ ticker: 'nvda', scheduledAt: 1_700_000_000_000, mode: 'pre' });
    for (const s of specs) {
      expect(s.config.name).toContain('NVDA');
    }
  });
});

describe('runEarningsPreview3W (default runFn, offline)', () => {
  test('offline → source=framework, all 3 fields empty', async () => {
    const { preview, group } = await runEarningsPreview3W(
      { ticker: 'NVDA', scheduledAt: 1_700_000_000_000, mode: 'pre', offline: true },
    );
    expect(preview.ticker).toBe('NVDA');
    expect(preview.source).toBe('framework');
    expect(preview.consensus).toEqual([]);
    expect(preview.recentTweets).toEqual([]);
    expect(preview.transcripts).toEqual([]);
    expect(group.full).toBe(true);  // all 3 workers succeed (just with empty data)
  });

  test('offline=false → at least sentiment worker has mock data', async () => {
    const { preview, group } = await runEarningsPreview3W(
      { ticker: 'NVDA', scheduledAt: 1_700_000_000_000, mode: 'pre', offline: false },
    );
    expect(group.full).toBe(true);
    // Sentiment worker uses x-search mock which always returns curated voices
    expect(preview.recentTweets.length).toBeGreaterThan(0);
    // Source is at least 'partial'
    expect(['partial', 'full']).toContain(preview.source);
  });

  test('all workers fail → preview source degrades to framework', async () => {
    const failingRunFn: WorkerRunFn = async () => ({
      success: false,
      error: 'synthetic',
      toolCalls: 0,
      duration: 0,
    });
    const { preview, group } = await runEarningsPreview3W(
      { ticker: 'NVDA', scheduledAt: 1_700_000_000_000, mode: 'pre', offline: true },
      failingRunFn,
    );
    expect(group.failed).toBe(true);
    expect(preview.source).toBe('framework');
  });

  test('1 worker fails → other 2 fields still populated, group.partial=true', async () => {
    // Realistic partial-failure mock: the transcript worker fails (8-K
    // fetch error), but the analyst + sentiment workers return their data.
    const selective: WorkerRunFn = async (spec) => {
      if (spec.key === 'transcript') {
        return { success: false, error: '8-K fetch failed', toolCalls: 0, duration: 0 };
      }
      if (spec.key === 'analyst') {
        return {
          success: true,
          output: JSON.stringify({
            verdict: 'BEAT_EXPECTATIONS',
            consensus: [{ period: 'Q1 2025', metric: 'eps', consensus: 1.5, currency: 'USD' }],
          }),
          toolCalls: 1, duration: 0,
        };
      }
      // sentiment
      return {
        success: true,
        output: JSON.stringify({
          polarity: 0.4,
          voices: [{ handle: 'mock', tweetId: 't1', url: 'https://x.com/mock/status/t1', ts: 1_700_000_000_000, authorKind: 'analyst-buy', snippet: 'synthetic' }],
        }),
        toolCalls: 1, duration: 0,
      };
    };
    const { preview, group } = await runEarningsPreview3W(
      { ticker: 'NVDA', scheduledAt: 1_700_000_000_000, mode: 'pre', offline: true },
      selective,
    );
    expect(group.partial).toBe(true);
    // transcripts empty (the failed worker), but analyst + sentiment populated
    expect(preview.transcripts).toEqual([]);
    expect(preview.consensus.length).toBe(1);
    expect(preview.consensus[0]!.metric).toBe('eps');
    expect(preview.recentTweets.length).toBe(1);
    expect(preview.recentTweets[0]!.authorKind).toBe('analyst-buy');
  });
});

describe('runEarningsPreview3W (3-worker concurrency)', () => {
  test('all 3 workers start within a tight window (true parallel)', async () => {
    const startTimes: Record<string, number> = {};
    const endTimes: Record<string, number> = {};
    const tracking: WorkerRunFn = async (spec) => {
      startTimes[spec.key] = Date.now();
      await new Promise(r => setTimeout(r, 50));
      endTimes[spec.key] = Date.now();
      return { success: true, output: '{}', toolCalls: 0, duration: 50 };
    };
    const { group } = await runEarningsPreview3W(
      { ticker: 'NVDA', scheduledAt: 1_700_000_000_000, mode: 'pre', offline: true },
      tracking,
    );
    expect(group.full).toBe(true);
    // All 3 should have started within 20ms of each other
    const starts = Object.values(startTimes);
    const spread = Math.max(...starts) - Math.min(...starts);
    expect(spread).toBeLessThan(20);
  });
});
