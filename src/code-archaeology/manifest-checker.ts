/**
 * Capability Manifest 命中度检查。
 *
 * v3 capability-manifest.ts 定义 5 groups(realtime / coordinator / kairos /
 * trading / portfolio),每个 group 有 prefixes(工具名前缀)。
 * 本模块扫 src/tools/ 下的文件,看每个 group 实际命中多少个 tool 文件。
 *
 * 输出 ManifestCoverage[]:每个 group 的 id/title/matchedFiles/prefixes。
 */
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ManifestCoverage } from './types.js';

/**
 * CAPABILITY_GROUPS 通过 dynamic import 获取(避免触发 langchain 静态链)。
 * 失败时降级为内嵌的 5 group 最小集,保证 manifest-checker 仍可用。
 */
async function loadCapabilityGroups(): Promise<Array<{ id: string; title: string; prefixes: string[] }>> {
  try {
    const mod = await import('../agent/capability-manifest.js');
    return mod.CAPABILITY_GROUPS as Array<{ id: string; title: string; prefixes: string[] }>;
  } catch {
    // 降级:5 group 最小集
    return [
      { id: 'realtime', title: 'Realtime market data', prefixes: ['realtime_'] },
      { id: 'coordinator', title: 'Multi-worker analysis', prefixes: ['analyze_', 'list_research_'] },
      { id: 'kairos', title: 'Proactive scanner / monitor', prefixes: ['kairos_'] },
      { id: 'trading', title: 'Paper / live trading', prefixes: ['place_trade_', 'cancel_trade_', 'get_trading_', 'get_trade_'] },
      { id: 'multimodal', title: 'Charts and reports', prefixes: ['render_chart', 'render_research_report', 'ascii_', 'report_'] },
    ];
  }
}

/** 列出 tools/ 下所有子目录(每个子目录算一个 group 候选) */
async function listToolDirs(toolsRoot: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(toolsRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const dirs: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    // 跳过 _internal / __tests__ 等
    if (e.name.startsWith('_') || e.name.startsWith('.')) continue;
    dirs.push(join(toolsRoot, e.name));
  }
  return dirs;
}

/** 列出目录下所有 .ts 文件(递归) */
async function listTsIn(dir: string, out: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      await listTsIn(full, out);
    } else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

/** 用 prefix 命中数推断每个 group 实际覆盖的工具文件数 */
export async function checkManifestCoverage(root: string): Promise<ManifestCoverage[]> {
  const groups = await loadCapabilityGroups();
  const toolsRoot = join(root, 'src', 'tools');
  const subDirs = await listToolDirs(toolsRoot);
  const allFiles: string[] = [];
  for (const d of subDirs) {
    await listTsIn(d, allFiles);
  }
  // 用 prefix 命中(检查 export 的 symbol 名 / file basename)
  const result: ManifestCoverage[] = [];
  for (const group of groups) {
    let matched = 0;
    for (const f of allFiles) {
      const base = f.split('/').pop() ?? '';
      // 1) file basename 以 prefix 开头
      if (group.prefixes.some((p) => base.toLowerCase().startsWith(p.toLowerCase()))) {
        matched++;
        continue;
      }
      // 2) file 中 export 任何 symbol 以 prefix 开头
      // 简单 grep 风格(这里不读文件内容,只检查 basename + 路径段)
      if (group.prefixes.some((p) => f.toLowerCase().includes(p.toLowerCase()))) {
        matched++;
      }
    }
    result.push({
      groupId: group.id,
      title: group.title,
      matchedFiles: matched,
      prefixes: [...group.prefixes],
    });
  }
  return result;
}
