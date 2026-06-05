/**
 * 死文件 / 孤儿文件检测。
 *
 * 三类候选:
 *   1. no-inbound:文件没有任何 inbound import(没人 import 它)
 *   2. no-outbound-and-no-export:文件没有 outbound import 也没有 export
 *      (如纯数据文件、配置文件,可能是 test fixture)
 *   3. empty:文件 LOC < 5(几乎空的)
 *
 * 注意:此模块只是"候选"——不是真正死代码(可能是 entry point、test fixture、
 * SKILL.md 资源文件、types 聚合等)。需人工复核。
 */
import type { OrphanCandidate, ScanResult, SourceFile } from './types.js';

const ENTRY_FILES = new Set([
  'src/index.tsx',
  'src/cli.tsx',
  'src/run.ts',
  'src/providers.ts',
  'src/bundled-runner.ts',
]);

/** 找出所有被引用的 relPath(去 .ts/.tsx 扩展) */
function normalize(p: string): string {
  return p
    .split('\\').join('/')
    .replace(/\.(tsx?|jsx?)$/, '')
    .replace(/\/index$/, '');
}

function buildInboundsSet(scan: ScanResult): Set<string> {
  const inbounds = new Set<string>();
  // entry files 自己算有 inbound
  for (const ef of ENTRY_FILES) inbounds.add(ef);
  // 显式 add 每个 entry 的变体
  for (const ef of ENTRY_FILES) inbounds.add(normalize(ef));
  for (const f of scan.files) {
    for (const imp of f.imports) {
      if (imp.resolved) {
        const rel = imp.resolved.startsWith(scan.root)
          ? imp.resolved.slice(scan.root.length + 1)
          : imp.resolved;
        // 多种变体(原始 + 去扩展 + 去 /index)
        inbounds.add(normalize(rel));
        // 也加原始
        inbounds.add(rel.split('\\').join('/'));
      }
    }
  }
  return inbounds;
}

export function findOrphans(scan: ScanResult, opts: { minLoc?: number } = {}): OrphanCandidate[] {
  const minLoc = opts.minLoc ?? 5;
  const inbounds = buildInboundsSet(scan);
  const out: OrphanCandidate[] = [];
  for (const f of scan.files) {
    if (f.loc < minLoc) {
      out.push({ path: f.path, relPath: f.relPath, layer: f.layer, loc: f.loc, reason: 'empty' });
      continue;
    }
    if (ENTRY_FILES.has(f.relPath)) continue;
    // 无 inbound 且 是某种"helper/util" 嫌疑
    const hasInbound = inbounds.has(f.relPath) || inbounds.has(normalize(f.relPath));
    if (!hasInbound && f.imports.length === 0 && f.exports.length === 0) {
      out.push({ path: f.path, relPath: f.relPath, layer: f.layer, loc: f.loc, reason: 'no-outbound-and-no-export' });
      continue;
    }
    if (!hasInbound) {
      out.push({ path: f.path, relPath: f.relPath, layer: f.layer, loc: f.loc, reason: 'no-inbound' });
    }
  }
  // 按 LOC 降序
  return out.sort((a, b) => b.loc - a.loc);
}
