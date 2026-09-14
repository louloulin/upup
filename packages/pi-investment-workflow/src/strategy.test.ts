/**
 * /strategy CLI tests (P2.a.5 + P2.a.6)
 */

import { describe, expect, test } from 'bun:test';
import { runStrategy } from './strategy.js';
import { StrategyStore } from '@upup/memory';

function inMemStore(): StrategyStore {
  return new StrategyStore({ inMemory: true, now: () => 1_700_000_000_000 });
}

const FULL_METHODOLOGY = {
  factorSources: [{ name: 'PE-TTM', source: 'src/tools/finance/metrics.ts' }],
  lookAheadBiasCheck: 'pass',
  walkForward: {
    trainWindowDays: 252,
    testWindowDays: 63,
    folds: [
      { trainStartDate: '2020-01-01', trainEndDate: '2020-12-31', testStartDate: '2021-01-01', testEndDate: '2021-03-31', oosReturnPct: 0.05, winRatePct: 0.55 },
      { trainStartDate: '2021-01-01', trainEndDate: '2021-12-31', testStartDate: '2022-01-01', testEndDate: '2022-03-31', oosReturnPct: 0.08, winRatePct: 0.60 },
      { trainStartDate: '2022-01-01', trainEndDate: '2022-12-31', testStartDate: '2023-01-01', testEndDate: '2023-03-31', oosReturnPct: -0.02, winRatePct: 0.45 },
    ],
  },
  outOfSample: { startDate: '2023-04-01', endDate: '2024-12-31', totalReturnPct: 0.1, tradeCount: 5 },
};

describe('/strategy CLI (P2.a.5)', () => {
  test('无参数 → 显示 usage', () => {
    const out = runStrategy('');
    expect(out).toContain('用法: /strategy');
    expect(out).toContain('list');
    expect(out).toContain('audit');
  });

  test('未知子命令 → 报错 + usage', () => {
    const out = runStrategy('foo');
    expect(out).toContain('未知子命令');
    expect(out).toContain('用法:');
  });
});

describe('/strategy list (P2.a.5)', () => {
  test('空 store → 提示暂无', () => {
    const out = runStrategy('list', inMemStore());
    expect(out).toContain('暂无策略');
  });

  test('有策略 → 按 name 分组, 显示 version + 合规标', () => {
    const s = inMemStore();
    s.publish({
      name: 'low-pe', author: 'me', code: 'x', methodology: FULL_METHODOLOGY,
      version: 1, prevHash: '0'.repeat(64), description: 'low pe',
    });
    const out = runStrategy('list', s);
    expect(out).toContain('low-pe');
    expect(out).toContain('v1');
    expect(out).toContain('合规');
  });
});

describe('/strategy show (P2.a.5)', () => {
  test('show by id', () => {
    const s = inMemStore();
    const r = s.publish({
      name: 'momo', author: 'me', code: 'export function run(){return 1}', methodology: FULL_METHODOLOGY,
      version: 1, prevHash: '0'.repeat(64), description: 'momo',
    });
    const out = runStrategy(`show ${r.id}`, s);
    expect(out).toContain(r.id);
    expect(out).toContain('momo v1');
  });

  test('show by name (latest)', () => {
    const s = inMemStore();
    s.publish({
      name: 'momo', author: 'me', code: 'x', methodology: FULL_METHODOLOGY,
      version: 1, prevHash: '0'.repeat(64), description: 'm',
    });
    const out = runStrategy('show momo', s);
    expect(out).toContain('momo v1');
  });

  test('未找到 → ✗ 错误', () => {
    const out = runStrategy('show nothing', inMemStore());
    expect(out).toContain('找不到');
  });
});

describe('/strategy new (P2.a.5)', () => {
  test('输出 JSON 模板, 含 methodology 块', () => {
    const out = runStrategy('new my-strat');
    expect(out).toContain('my-strat');
    expect(out).toContain('"methodology"');
    expect(out).toContain('"factorSources"');
    expect(out).toContain('"outOfSample"');
  });
});

describe('/strategy publish (P2.a.5 + P2.a.2 集成)', () => {
  test('publish v1, 然后 audit pass', () => {
    const s = inMemStore();
    const json = JSON.stringify({
      author: 'me',
      code: 'export function run() { return 1; }',
      methodology: FULL_METHODOLOGY,
      description: 'test',
    });
    const out = runStrategy(`publish my-strat ${json}`, s);
    expect(out).toContain('Published');
    expect(out).toContain('my-strat v1');
    expect(out).toContain('合规');
    // Audit should pass
    const auditOut = runStrategy('audit my-strat', s);
    expect(auditOut).toContain('PASS');
  });

  test('publish v1 缺 methodology → audit FAIL', () => {
    const s = inMemStore();
    const json = JSON.stringify({
      author: 'me', code: 'x', description: 'bad',
    });
    const out = runStrategy(`publish bad ${json}`, s);
    // 仍然 publish 成功 (因为 strategy-store 只在 publish 时校验 name/code/version)
    // 但 audit 会 fail
    expect(out).toContain('Published');
    const auditOut = runStrategy('audit bad', s);
    expect(auditOut).toContain('FAIL');
  });

  test('JSON 解析失败 → 友好错误', () => {
    const out = runStrategy('publish broken not-json', inMemStore());
    expect(out).toContain('解析 JSON 失败');
  });
});

describe('/strategy fork (P2.a.5)', () => {
  test('fork 已有策略 → 创建新 v1 + 记录 parent', () => {
    const s = inMemStore();
    const src = s.publish({
      name: 'parent-strat', author: 'alice', code: 'x', methodology: FULL_METHODOLOGY,
      version: 1, prevHash: '0'.repeat(64), description: 'parent',
    });
    const out = runStrategy(`fork ${src.id} child-strat`, s);
    expect(out).toContain('Forked');
    expect(out).toContain('parent-strat v1');
    expect(out).toContain('child-strat v1');
    expect(out).toContain(src.id);
  });

  test('fork 不存在的策略 → ✗', () => {
    const out = runStrategy('fork nonexistent x', inMemStore());
    expect(out).toContain('找不到');
  });
});

describe('/strategy audit (P2.a.6)', () => {
  test('合规策略 → PASS + 列各项', () => {
    const s = inMemStore();
    s.publish({
      name: 'good', author: 'me', code: 'x', methodology: FULL_METHODOLOGY,
      version: 1, prevHash: '0'.repeat(64), description: 'good',
    });
    const out = runStrategy('audit good', s);
    expect(out).toContain('PASS');
    expect(out).toContain('factorSources');
    expect(out).toContain('lookAheadBias');
    expect(out).toContain('walkForward');
    expect(out).toContain('outOfSample');
  });

  test('不合规策略 → FAIL + 列缺什么', () => {
    const s = inMemStore();
    s.publish({
      name: 'bad', author: 'me', code: 'x', methodology: {
        factorSources: [],
        lookAheadBiasCheck: 'fail',
        walkForward: { trainWindowDays: 252, testWindowDays: 63, folds: [] },
        outOfSample: undefined,
      },
      version: 1, prevHash: '0'.repeat(64), description: 'bad',
    });
    const out = runStrategy('audit bad', s);
    expect(out).toContain('FAIL');
    expect(out).toContain('缺');
  });

  test('audit 不存在 → ✗', () => {
    const out = runStrategy('audit nothing', inMemStore());
    expect(out).toContain('找不到');
  });
});
