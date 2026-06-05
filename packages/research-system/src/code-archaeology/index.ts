/**
 * Code Archaeology — 主入口 (Sprint v4-1)。
 *
 * 流程:
 *   1. scanner.scan(root, { cache })  → ScanResult
 *   2. checkManifestCoverage(root)    → ManifestCoverage[]
 *   3. findOrphans(scan)              → OrphanCandidate[]
 *   4. findHotspots(scan)             → Hotspot[]
 *   5. compute layer stats            → LayerStat[]
 *   6. markdown-renderer.render()     → string
 *   7. write .upup/archaeology-cache.json + docs/CODE-MAP.md
 *
 * 编译开关:`feature('CODE_ARCHAEOLOGY')` — 未启用时返回 no-op
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
// code-archaeology 不强依赖 feature-gates(避免触发 telemetry 静态链);用 dynamic import + 失败 fallback。
import { findHotspots } from './hot-spot-finder.js';
import { detectLayer } from './layer-detector.js';
import { checkManifestCoverage } from './manifest-checker.js';
import { renderCodeMap } from './markdown-renderer.js';
import { findOrphans } from './orphan-finder.js';
import { readCache, scan, writeCache } from './scanner.js';
import type { CodeMapReport, Layer, LayerStat, ScanResult } from './types.js';

export interface RunOptions {
  root: string;
  /** 缓存路径(默认 .upup/archaeology-cache.json) */
  cachePath?: string;
  /** 输出路径(默认 docs/CODE-MAP.md) */
  outputPath?: string;
  /** 增量模式(默认 true) */
  incremental?: boolean;
}

export const DEFAULT_CACHE = '.upup/archaeology-cache.json';
export const DEFAULT_OUTPUT = 'docs/CODE-MAP.md';

function computeLayerStats(scan: ScanResult): LayerStat[] {
  const buckets = new Map<Layer, { count: number; loc: number; bytes: number }>();
  for (const f of scan.files) {
    const cur = buckets.get(f.layer) ?? { count: 0, loc: 0, bytes: 0 };
    cur.count++;
    cur.loc += f.loc;
    cur.bytes += f.bytes;
    buckets.set(f.layer, cur);
  }
  const totalLoc = scan.totalLoc || 1;
  const totalBytes = scan.totalBytes || 1;
  const order: Layer[] = ['L1', 'L2', 'L3', 'L4', 'L5', 'other'];
  const stats: LayerStat[] = [];
  for (const l of order) {
    const b = buckets.get(l);
    if (!b) continue;
    stats.push({
      layer: l,
      fileCount: b.count,
      totalLoc: b.loc,
      locPercent: Number((b.loc / totalLoc * 100).toFixed(1)),
      bytePercent: Number((b.bytes / totalBytes * 100).toFixed(1)),
    });
  }
  return stats;
}

/** 单次完整运行:扫 + 渲染 + 写文件 + 写缓存 */
export async function run(opts: RunOptions): Promise<CodeMapReport | null> {
  // 动态 import feature-gates(避免触发 telemetry/langchain 静态链)
  // 失败时视为 always-on(CLI 场景)
  let isFeatureCompiledIn: ((name: string) => boolean) | null = null;
  try {
    const mod = await import('@upup/agent-runtime/feature-gates');
    isFeatureCompiledIn = mod.isFeatureCompiledIn;
  } catch { /* fallback: 视为 enabled */ }
  if (isFeatureCompiledIn && !isFeatureCompiledIn('CODE_ARCHAEOLOGY')) {
    return null; // 编译期 DCE
  }
  const cachePath = opts.cachePath ?? join(opts.root, DEFAULT_CACHE);
  const outputPath = opts.outputPath ?? join(opts.root, DEFAULT_OUTPUT);
  const incremental = opts.incremental ?? true;

  const cache = incremental ? await readCache(cachePath) : null;
  const scanResult = await scan(opts.root, { cache, cachePath });
  const manifestCoverage = await checkManifestCoverage(opts.root);
  const orphans = findOrphans(scanResult);
  const hotspots = findHotspots(scanResult, 20);
  const layers = computeLayerStats(scanResult);

  const report: CodeMapReport = {
    root: opts.root,
    generatedAt: new Date().toISOString(),
    scan: scanResult,
    layers,
    manifestCoverage,
    orphans,
    hotspots,
    groups: [],
  };
  const md = renderCodeMap(report);

  // 写 docs/CODE-MAP.md
  await mkdir(outputPath.substring(0, outputPath.lastIndexOf('/')), { recursive: true });
  await writeFile(outputPath, md, 'utf8');

  // 更新缓存
  const fileMap: Record<string, { hash: string; mtime: number }> = {};
  for (const f of scanResult.files) {
    fileMap[f.relPath] = { hash: f.hash, mtime: f.mtime };
  }
  await writeCache(cachePath, {
    version: 1,
    lastScanAt: report.generatedAt,
    files: fileMap,
  });

  return report;
}

export type { CodeMapReport, LayerStat, ScanResult } from './types.js';
export { detectLayer, refineLayer } from './layer-detector.js';
export { scan, readCache, writeCache } from './scanner.js';
export { findOrphans } from './orphan-finder.js';
export { findHotspots } from './hot-spot-finder.js';
export { checkManifestCoverage } from './manifest-checker.js';
export { renderCodeMap } from './markdown-renderer.js';
