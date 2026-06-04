/**
 * Hot Spot 检测 —— 按 inbound import 数排序的 top N 文件。
 *
 * 算法:
 *   1. 遍历所有文件的 imports,统计每个 target 路径的 inbound count
 *   2. 按 count 降序
 *   3. 截 top N(默认 20)
 *
 * 注意:relPath 匹配需做 .ts/.tsx 扩展和 /index 变体归一化。
 */
import type { Hotspot, ScanResult } from './types.js';

/** 归一化路径,用于匹配 inbound 计数 */
function normalize(p: string): string {
  return p
    .split('\\').join('/')
    .replace(/\.(ts|tsx)$/, '')
    .replace(/\/index$/, '');
}

export function findHotspots(scan: ScanResult, topN = 20): Hotspot[] {
  const inbound = new Map<string, number>();
  for (const f of scan.files) {
    for (const imp of f.imports) {
      if (!imp.resolved) continue;
      const key = normalize(imp.resolved.startsWith(scan.root) ? imp.resolved.slice(scan.root.length + 1) : imp.resolved);
      inbound.set(key, (inbound.get(key) ?? 0) + 1);
    }
  }
  const out: Hotspot[] = [];
  for (const f of scan.files) {
    const key = normalize(f.relPath);
    const c = inbound.get(key) ?? 0;
    if (c > 0) out.push({ path: f.path, relPath: f.relPath, layer: f.layer, inboundCount: c });
  }
  return out.sort((a, b) => b.inboundCount - a.inboundCount).slice(0, topN);
}
