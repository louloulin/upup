#!/usr/bin/env bun
/**
 * Code Archaeology CLI — Sprint v4-1 of top-tier-investment-claude-code-v4.
 *
 * 用法:
 *   bun run code-archaeology                 # 完整扫描(增量模式)
 *   bun run code-archaeology --full          # 强制全量(忽略缓存)
 *   bun run code-archaeology --output PATH   # 自定义输出路径
 *
 * 默认输出:
 *   - docs/CODE-MAP.md       Markdown 报告
 *   - .upup/archaeology-cache.json  增量缓存
 */
import { run } from '../src/code-archaeology/index.js';

const args = process.argv.slice(2);
const isFull = args.includes('--full');
const outputIdx = args.indexOf('--output');
const outputPath = outputIdx >= 0 ? args[outputIdx + 1] : undefined;
const root = process.cwd();

async function main(): Promise<void> {
  const t0 = Date.now();
  const report = await run({
    root,
    outputPath,
    incremental: !isFull,
  });
  if (!report) {
    console.log('⚠️  CODE_ARCHAEOLOGY feature is disabled (set BUN_CONFIG_FEATURE_CODE_ARCHAEOLOGY=1 to enable)');
    return;
  }
  const dt = Date.now() - t0;
  console.log(`✅ Code Archaeology done in ${dt}ms`);
  console.log(`   Files:     ${report.scan.totalFiles}`);
  console.log(`   LOC:       ${report.scan.totalLoc.toLocaleString()}`);
  console.log(`   Bytes:     ${(report.scan.totalBytes / 1024).toFixed(1)} KB`);
  console.log(`   Layers:    ${report.layers.length}`);
  console.log(`   Orphans:   ${report.orphans.length}`);
  console.log(`   Hotspots:  ${report.hotspots.length}`);
  console.log(`   Output:    docs/CODE-MAP.md`);
}

main().catch((err) => {
  console.error('❌ code-archaeology failed:', err);
  process.exit(1);
});
