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

/**
 * P1.a.4 — 3W pipeline dossier integration
 *
 * Coverage:
 *  - with dossier injected + successful workers w/ transcripts → earningsCalls grows
 *  - with dossier injected but source='framework' (offline) → no persistence
 *  - without dossier → no error, preview still produced
 *  - diff_against_prior_call is populated when dossier has prior call
 */
describe('runEarningsPreview3W — dossier integration (P1.a.4)', () => {
  test('persists call to dossier when source=full + transcripts non-empty', async () => {
    const { DossierStore } = await import('../memory/dossier.js');
    const dossiers = new DossierStore({ inMemory: true, now: () => 1_700_000_000_000 });
    // Custom runFn: 3 workers all return real data → source='full'
    const runFn: WorkerRunFn = async (spec) => {
      if (spec.key === 'analyst') {
        return {
          success: true,
          output: JSON.stringify({
            verdict: 'BEAT',
            consensus: [{ period: 'Q1 2025', metric: 'eps', consensus: 1.5, currency: 'USD' }],
          }),
          toolCalls: 1, duration: 0,
        };
      }
      if (spec.key === 'sentiment') {
        return {
          success: true,
          output: JSON.stringify({
            polarity: 0.5,
            voices: [{ handle: 'm', tweetId: 't1', url: 'https://x.com/m/status/t1', ts: 0, authorKind: 'analyst-buy', snippet: 's' }],
          }),
          toolCalls: 1, duration: 0,
        };
      }
      // transcript
      return {
        success: true,
        output: JSON.stringify({
          transcripts: [
            { filingDate: '2025-01-15', url: 'https://sec/8k-1', excerpt: 'e', ts: 1_700_000_000_000 },
          ],
        }),
        toolCalls: 1, duration: 0,
      };
    };
    const { preview } = await runEarningsPreview3W(
      { ticker: 'NVDA', scheduledAt: 1_700_000_000_000, mode: 'pre', dossiers },
      runFn,
    );
    expect(preview.source).toBe('full');
    const d = dossiers.read('NVDA')!;
    expect(d).toBeDefined();
    expect(d.earningsCalls).toHaveLength(1);
    expect(d.earningsCalls[0]!.transcriptRefs).toEqual(['https://sec/8k-1']);
  });

  test('does NOT persist when source=framework (offline mode)', async () => {
    const { DossierStore } = await import('../memory/dossier.js');
    const dossiers = new DossierStore({ inMemory: true });
    await runEarningsPreview3W(
      { ticker: 'NVDA', scheduledAt: 1_700_000_000_000, mode: 'pre', offline: true, dossiers },
    );
    expect(dossiers.read('NVDA')).toBeUndefined();
  });

  test('does NOT persist when transcripts empty (source=partial without transcripts)', async () => {
    const { DossierStore } = await import('../memory/dossier.js');
    const dossiers = new DossierStore({ inMemory: true });
    // Mock: only sentiment succeeds, no transcripts → source=partial
    const runFn: WorkerRunFn = async (spec) => {
      if (spec.key === 'sentiment') {
        return {
          success: true,
          output: JSON.stringify({
            polarity: 0.5,
            voices: [{ handle: 'm', tweetId: 't1', url: 'u', ts: 0, authorKind: 'analyst-buy', snippet: 's' }],
          }),
          toolCalls: 1, duration: 0,
        };
      }
      return { success: false, error: 'no data', toolCalls: 0, duration: 0 };
    };
    await runEarningsPreview3W(
      { ticker: 'NVDA', scheduledAt: 1_700_000_000_000, mode: 'pre', offline: true, dossiers },
      runFn,
    );
    // source will be 'partial' (sentiment has data) but transcripts is empty → no persist
    expect(dossiers.read('NVDA')).toBeUndefined();
  });

  test('without dossier: no error, preview still produced', async () => {
    // Use default runFn, no dossier injected
    const { preview, group } = await runEarningsPreview3W(
      { ticker: 'NVDA', scheduledAt: 1_700_000_000_000, mode: 'pre', offline: true },
    );
    expect(preview.ticker).toBe('NVDA');
    expect(group.full).toBe(true);
  });

  test('diff_against_prior_call populated from prior dossier call', async () => {
    const { DossierStore } = await import('../memory/dossier.js');
    const dossiers = new DossierStore({ inMemory: true, now: () => 1_700_000_000_000 });
    // Seed: 1 prior call, 1 buy tweet, 1 sell tweet
    dossiers.create('NVDA', { name: 'NVIDIA', sector: 'Tech', marketCap: 1, oneLiner: 'x' });
    dossiers.appendEarningsCall('NVDA', {
      callId: 'ec-NVDA-1',
      callTs: 1_699_000_000_000,
      transcriptRefs: ['https://sec/old'],
    });
    const runFn: WorkerRunFn = async (spec) => {
      if (spec.key === 'sentiment') {
        return {
          success: true,
          output: JSON.stringify({
            polarity: 0.5,
            voices: [
              { handle: 'b1', tweetId: '1', url: 'u1', ts: 0, authorKind: 'analyst-buy', snippet: 'x' },
              { handle: 'b2', tweetId: '2', url: 'u2', ts: 0, authorKind: 'analyst-buy', snippet: 'y' },
              { handle: 's',  tweetId: '3', url: 'u3', ts: 0, authorKind: 'analyst-sell', snippet: 'z' },
            ],
          }),
          toolCalls: 1, duration: 0,
        };
      }
      if (spec.key === 'transcript') {
        return {
          success: true,
          output: JSON.stringify({
            transcripts: [
              { filingDate: '2025-04-15', url: 'https://sec/8k-new', excerpt: 'z', ts: 1_700_000_500_000 },
            ],
          }),
          toolCalls: 1, duration: 0,
        };
      }
      return { success: false, error: 'no data', toolCalls: 0, duration: 0 };
    };
    const { preview } = await runEarningsPreview3W(
      { ticker: 'NVDA', scheduledAt: 1_700_000_500_000, mode: 'pre', offline: true, dossiers },
      runFn,
    );
    expect(preview.diff_against_prior_call).toBeDefined();
    expect(preview.diff_against_prior_call!.lastCallTs).toBe(1_699_000_000_000);
    expect(preview.diff_against_prior_call!.toneDelta).toContain('净买入');
  });
});
