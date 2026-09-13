/**
 * /strategy — 策略市场 CLI (Gap G5 / P2.a.5 + P2.a.6)
 *
 * 5 个子命令:
 *   list                    — 列出所有已 publish 的策略 (按 name + version)
 *   show <id|name>          — 展示策略详情 + 上一次 backtest 报告链接
 *   new <name>              — 输出策略模板 (供用户 / LLM 编辑)
 *   publish <name> <code>   — publish 新版本 (P2.a.2 strategy-store)
 *   fork <id> <newName>     — fork 已有策略, 创建一个新 v1 (P2.a.2)
 *   audit <id>              — 校验方法学披露 (P2.a.6) — 缺 factorSources /
 *                             lookAheadBias / walkForward / outOfSample 即 FAIL
 *
 * 模块边界:
 *   strategy.ts (Layer 4) → strategy-store (Layer 3) + backtest-report (Layer 3)
 *   不依赖 src/runtime/pi/* 内部实现 (避免反向)
 *
 * 复用:
 *   - validateMethodology() 单一来源
 *   - renderBacktestReport 链接占位 (实际报告由用户主动 /strategy run 触发)
 */

import { StrategyStore, computeStrategyPrevHash, type StrategyRecord, type StrategyRecordInput } from '../../memory/strategy-store.js';
import { validateMethodology, type MethodologyDisclosure } from '@upup/pi-backtest';


/**
 * Runtime narrowing: StrategyRecord stores `methodology` as `unknown`
 * (the versioned+signed input may carry whatever the publisher wrote),
 * but the only call site that actually needs to *validate* it is
 * /strategy audit + the report renderers — both of which know the
 * shape. This guard preserves the unknown-typed store contract while
 * giving callers a type-safe handle.
 */
function asMethodology(m: unknown): MethodologyDisclosure {
  return m as MethodologyDisclosure;
}

const USAGE = [
  '',
  '  用法: /strategy <子命令> [args...]',
  '  子命令:',
  '    list                            列出已 publish 的策略',
  '    show <id|name>                  展示策略详情',
  '    new <name>                      输出策略模板 (供编辑)',
  '    publish <name> <code...>        publish 新版本 v1 (含合规的 methodology 块)',
  '    fork <id> <newName>             fork 已有策略, 创建新 v1',
  '    audit <id>                      校验方法学披露 (P2.a.6)',
  '',
  '  示例:',
  '    /strategy list',
  '    /strategy show low-pe-high-roe',
  '    /strategy new momentum-v1',
  '    /strategy audit s-abc-123',
  '',
];

function parseArgs(args: string): { subcommand: string; rest: string[] } {
  const trimmed = args.trim();
  if (!trimmed) return { subcommand: '', rest: [] };
  const parts = trimmed.split(/\s+/);
  return { subcommand: parts[0] ?? '', rest: parts.slice(1) };
}

function formatTs(ts: number): string {
  return new Date(ts).toISOString().slice(0, 16).replace('T', ' ');
}

function formatMethodologyBadge(valid: { ok: boolean; missing: readonly string[] }): string {
  return valid.ok ? '✓ 合规' : `✗ 缺: ${valid.missing.join(', ')}`;
}

function renderRecord(rec: StrategyRecord, store: StrategyStore): string[] {
  const valid = validateMethodology(asMethodology(rec.methodology));
  return [
    `  ─ ${rec.name} v${rec.version} ─`,
    `    id:        ${rec.id}`,
    `    author:    ${rec.author}`,
    `    ts:        ${formatTs(rec.ts)}`,
    `    describe:  ${rec.description}`,
    `    tags:      ${(rec.tags ?? []).join(', ') || '(none)'}`,
    `    method:    ${formatMethodologyBadge(valid)}`,
    `    parents:   ${rec.parentStrategyId ? `${rec.parentStrategyId}@v${rec.parentVersion ?? '?'}` : '(root)'}`,
    `    code (${rec.code.length} chars):`,
    ...rec.code.split('\n').slice(0, 8).map(l => '      ' + l),
    ...(rec.code.split('\n').length > 8 ? ['      ... (truncated)'] : []),
  ];
}

// ---------------------------------------------------------------------------
// Subcommand implementations
// ---------------------------------------------------------------------------

function cmdList(store: StrategyStore): string {
  const latests = store.latestPerName();
  if (latests.length === 0) {
    return ['', '  暂无策略。', '  提示: /strategy new <name> 创建模板。', ''].join('\n');
  }
  const lines = ['', '  已 publish 策略', '  ─────────────────────────────────────'];
  // Sort by name for stable display. The store doesn't promise an order
  // — we just need a consistent one for the user.
  for (const latest of [...latests].sort((a, b) => a.name.localeCompare(b.name))) {
    const versionsForName = store.getVersions(latest.name);
    const valid = validateMethodology(asMethodology(latest.methodology));
    lines.push(`  ${latest.name}  v${latest.version} (${versionsForName.length} 版本)  ${formatMethodologyBadge(valid)}`);
    lines.push(`    latest id: ${latest.id}  · ${formatTs(latest.ts)}`);
  }
  lines.push('');
  return lines.join('\n');
}

function cmdShow(rest: string[], store: StrategyStore): string {
  if (rest.length === 0) {
    return ['  错误: /strategy show <id|name> 需要参数', ''].join('\n');
  }
  const target = rest.join(' ');
  let rec: StrategyRecord | undefined;
  // Try as id first
  rec = store.getById(target);
  // Then as name (latest version)
  if (!rec) rec = store.getLatest(target);
  if (!rec) {
    return [`  ✗ 找不到 "${target}"`, ''].join('\n');
  }
  return ['', '═══════════════════════════════════════', ...renderRecord(rec, store), '', '═══════════════════════════════════════', ''].join('\n');
}

function cmdNew(rest: string[]): string {
  if (rest.length === 0) {
    return ['  错误: /strategy new <name> 需要参数', ''].join('\n');
  }
  const name = rest.join(' ');
  const template: StrategyRecordInput = {
    name,
    author: 'user',
    code: 'export function run(ctx) {\n  // ctx.universe: Ticker[]\n  // ctx.bars: Record<Ticker, DailyBar[]>\n  // 返回: { signal: "long" | "cash" | "short", confidence: number, reason: string }[]\n  return ctx.universe.map(t => ({ ticker: t, signal: "cash", confidence: 0, reason: "stub" }));\n}',
    methodology: {
      factorSources: [
        // 至少 1 个, 不然 audit fail
        { name: 'EXAMPLE_FACTOR', source: '@upup/pi-finance-sdk/...', description: '描述因子计算方法' },
      ],
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
      outOfSample: {
        startDate: '2023-04-01',
        endDate: '2024-12-31',
        totalReturnPct: 0.18,
        sharpeRatio: 1.4,
        maxDrawdownPct: -0.12,
        winRatePct: 0.58,
        tradeCount: 42,
      },
    },
    version: 1,
    prevHash: '0'.repeat(64),
    description: `${name} — 简述策略逻辑 (1 句)`,
    tags: [],
  };
  return [
    '',
    `  模板 (复制 → 编辑 → /strategy publish):`,
    '',
    JSON.stringify(template, null, 2),
    '',
    '  提示: 必须含 methodology 块 (factorSources / lookAheadBiasCheck / walkForward.folds / outOfSample)',
    '',
  ].join('\n');
}

function cmdPublish(rest: string[], store: StrategyStore): string {
  // 简化: 把 <name> 后所有内容当作 JSON 输入
  if (rest.length < 2) {
    return ['  错误: /strategy publish <name> <json>', ''].join('\n');
  }
  const name = rest[0]!;
  const jsonStr = rest.slice(1).join(' ');
  let parsed: Partial<StrategyRecordInput>;
  try {
    parsed = JSON.parse(jsonStr) as Partial<StrategyRecordInput>;
  } catch (e) {
    return [`  错误: 解析 JSON 失败: ${(e as Error).message}`, ''].join('\n');
  }
  // 默认 v1, 默认 prevHash genesis
  const latest = store.getLatest(name);
  const version = parsed.version ?? (latest ? latest.version + 1 : 1);
  const prevHash = parsed.prevHash ?? (latest ? computeStrategyPrevHash(latest) : '0'.repeat(64));
  try {
    const rec = store.publish({
      name: parsed.name ?? name,
      author: parsed.author ?? 'user',
      code: parsed.code ?? 'export function run() { return []; }',
      methodology: parsed.methodology ?? {},
      version,
      prevHash,
      description: parsed.description ?? `${name} v${version}`,
      tags: parsed.tags,
    });
    const valid = validateMethodology(asMethodology(rec.methodology));
    return [
      '',
      `  ✓ Published ${rec.name} v${rec.version}`,
      `    id:     ${rec.id}`,
      `    ts:     ${formatTs(rec.ts)}`,
      `    method: ${formatMethodologyBadge(valid)}`,
      '',
    ].join('\n');
  } catch (e) {
    return [`  ✗ publish 失败: ${(e as Error).message}`, ''].join('\n');
  }
}

function cmdFork(rest: string[], store: StrategyStore): string {
  if (rest.length < 2) {
    return ['  错误: /strategy fork <id|name> <newName>', ''].join('\n');
  }
  const src = rest[0]!;
  const newName = rest[1]!;
  const srcRec = store.getById(src) ?? store.getLatest(src);
  if (!srcRec) {
    return [`  ✗ 找不到源策略 "${src}"`, ''].join('\n');
  }
  // Fork = v1 of new name, with parentStrategyId pointing to src
  const newRec = store.publish({
    name: newName,
    author: srcRec.author,
    code: srcRec.code,
    methodology: srcRec.methodology,
    version: 1,
    prevHash: '0'.repeat(64),
    description: `Fork of ${srcRec.name} v${srcRec.version} — ${srcRec.description}`,
    tags: srcRec.tags,
    parentStrategyId: srcRec.id,
    parentVersion: srcRec.version,
  });
  return [
    '',
    `  ✓ Forked ${srcRec.name} v${srcRec.version} → ${newRec.name} v1`,
    `    new id: ${newRec.id}`,
    `    parent: ${srcRec.id}@v${srcRec.version}`,
    '',
  ].join('\n');
}

function cmdAudit(rest: string[], store: StrategyStore): string {
  if (rest.length === 0) {
    return ['  错误: /strategy audit <id|name> 需要参数', ''].join('\n');
  }
  const target = rest.join(' ');
  const rec = store.getById(target) ?? store.getLatest(target);
  if (!rec) {
    return [`  ✗ 找不到 "${target}"`, ''].join('\n');
  }
  const m = asMethodology(rec.methodology);
  const valid = validateMethodology(m);
  const lines = [
    '',
    `  审计: ${rec.name} v${rec.version} (${rec.id})`,
    `  ─────────────────────────────────────`,
  ];
  if (valid.ok) {
    lines.push('  ✓ PASS — 方法学披露完整');
    const fs = Array.isArray(m.factorSources) ? m.factorSources : [];
    const folds = m.walkForward?.folds ?? [];
    const oos = m.outOfSample;
    lines.push(`    - factorSources:     ${fs.length} 个`);
    lines.push(`    - lookAheadBias:     ${m.lookAheadBiasCheck ?? '(unset)'}`);
    lines.push(`    - walkForward.folds: ${folds.length} 个`);
    if (oos) lines.push(`    - outOfSample:       ${oos.startDate} → ${oos.endDate}`);
    else lines.push(`    - outOfSample:       (missing)`);
  } else {
    lines.push('  ✗ FAIL');
    for (const miss of valid.missing) {
      lines.push(`    - 缺: ${miss}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

export function runStrategy(args: string, store: StrategyStore = new StrategyStore()): string {
  const { subcommand, rest } = parseArgs(args);
  if (!subcommand) return USAGE.join('\n');
  switch (subcommand) {
    case 'list': return cmdList(store);
    case 'show': return cmdShow(rest, store);
    case 'new': return cmdNew(rest);
    case 'publish': return cmdPublish(rest, store);
    case 'fork': return cmdFork(rest, store);
    case 'audit': return cmdAudit(rest, store);
    default:
      return [`  未知子命令 "${subcommand}"`, ...USAGE].join('\n');
  }
}
