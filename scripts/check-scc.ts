/**
 * Strict SCC + Layer Audit
 *
 * Sprint v7-4 — 防止循环依赖、层违规、脆弱深层动态 import
 *
 * 检查项:
 *   1. 强连通分量 (SCC) > 1 → 循环依赖 → 失败
 *   2. 层违规 (Layer N → Layer M where N > M) → 失败
 *   3. 深层动态 import (3+ 级 ../) → 失败
 *
 * 分层 (数字越大越高层;高层可依赖低层,反之禁止):
 *   Layer 1: src/utils/         (pure helpers)
 *   Layer 2: src/state/, src/session/, src/portfolio/ (基础服务)
 *   Layer 3: src/tools/         (业务工具)
 *   Layer 4: src/plan/, src/skills/, src/agent/ (业务编排)
 *   Layer 5: src/commands/, src/controllers/, src/cli.tsx (顶层入口)
 *
 * 用法:
 *   bun run scripts/check-scc.ts              # 检查 src/ + packages/<pkg>/src/
 *   bun run scripts/check-scc.ts --json       # JSON 输出
 *   bun run scripts/check-scc.ts --strict     # 任意警告也 fail
 *
 * 退出码:
 *   0 — 全部通过
 *   1 — 有 cycle / layer violation / deep dynamic import
 *   2 — 参数错误
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ROOT = process.cwd();
const SCAN_DIRS = ['src', ...readdirSync('packages').filter(d => {
  const p = join('packages', d, 'src');
  return existsSync(p) && statSync(p).isDirectory();
}).map(d => join('packages', d, 'src'))];

const LAYER_RULES: Array<{ prefix: string; layer: number }> = [
  { prefix: 'src/utils/', layer: 1 },
  { prefix: 'src/state/', layer: 2 },
  { prefix: 'src/session/', layer: 2 },
  { prefix: 'src/portfolio/', layer: 2 },
  { prefix: 'src/storage/', layer: 2 },
  { prefix: 'src/telemetry/', layer: 2 },
  { prefix: 'src/hooks/', layer: 2 },
  { prefix: 'src/mcp/', layer: 2 },
  { prefix: 'src/skills/', layer: 3 },
  { prefix: 'src/tools/', layer: 3 },
  { prefix: 'src/plan/', layer: 4 },
  { prefix: 'src/agent/', layer: 4 },
  { prefix: 'src/multi-agent/', layer: 4 },
  { prefix: 'src/worktree/', layer: 4 },
  { prefix: 'src/daemon/', layer: 4 },
  { prefix: 'src/code-archaeology/', layer: 4 },
  { prefix: 'src/controllers/', layer: 5 },
  { prefix: 'src/commands/', layer: 5 },
  { prefix: 'src/bridge/', layer: 5 },
  { prefix: 'src/stdio/', layer: 5 },
  { prefix: 'src/gateway/', layer: 5 },
  { prefix: 'src/competitive-positioning/', layer: 5 },
  { prefix: 'src/cli', layer: 5 },
  { prefix: 'src/index', layer: 5 },
];

const PACKAGE_PREFIX = /^packages\/([^/]+)\/src\//;

// packages/* public boundary: only the index.ts of each package is reachable.
// Sub-paths force deep imports which is the exact pattern we want to flag.
function isPackagePublicEntry(path: string): boolean {
  const m = path.match(PACKAGE_PREFIX);
  if (!m) return false;
  return path.endsWith('/index.ts') || path.endsWith('/index.tsx');
}

// ---------------------------------------------------------------------------
// Walk + parse imports
// ---------------------------------------------------------------------------

function* walk(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (f === 'node_modules' || f.startsWith('.')) continue;
      yield* walk(p);
    } else if ((f.endsWith('.ts') || f.endsWith('.tsx')) && !f.endsWith('.d.ts')) {
      yield p;
    }
  }
}

const STATIC_RE = /(?:^|\n)\s*(?:import|export)\s+[\s\S]*?from\s+['"]([^'"]+)['"]/g;
const DYN_RE = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

interface ParsedFile {
  path: string;
  staticDeps: string[];
  dynDeps: string[];
}

function parseFile(path: string): ParsedFile {
  const content = readFileSync(path, 'utf-8');
  const staticDeps: string[] = [];
  const dynDeps: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = STATIC_RE.exec(content))) staticDeps.push(m[1]);
  while ((m = DYN_RE.exec(content))) dynDeps.push(m[1]);
  return { path, staticDeps, dynDeps };
}

function resolveSpecifier(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const d = dirname(fromFile);
  const parts = (d + '/' + spec).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  let path = out.join('/');
  // Try .ts / .tsx / /index.ts / /index.tsx
  for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    if (existsSync(ROOT + '/' + path + ext)) return path + ext;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Layer assignment
// ---------------------------------------------------------------------------

function getLayer(path: string): number {
  for (const r of LAYER_RULES) {
    if (path.startsWith(r.prefix)) return r.layer;
  }
  return 4; // default to mid layer
}

function packageOf(path: string): string | null {
  const m = path.match(PACKAGE_PREFIX);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Tarjan's SCC
// ---------------------------------------------------------------------------

function findSCCs(nodes: string[], edges: Map<string, Set<string>>): string[][] {
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];
  let index = 0;

  function strongconnect(v: string): void {
    idx.set(v, index);
    low.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);
    for (const t of edges.get(v) ?? []) {
      if (!idx.has(t)) {
        strongconnect(t);
        low.set(v, Math.min(low.get(v)!, low.get(t)!));
      } else if (onStack.has(t)) {
        low.set(v, Math.min(low.get(v)!, idx.get(t)!));
      }
    }
    if (low.get(v) === idx.get(v)) {
      const scc: string[] = [];
      while (true) {
        const w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
        if (w === v) break;
      }
      sccs.push(scc);
    }
  }

  for (const n of nodes) if (!idx.has(n)) strongconnect(n);
  return sccs;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

interface Report {
  cycles: string[][];
  layerViolations: Array<{ from: string; to: string; fromLayer: number; toLayer: number; reason: string }>;
  deepDynImports: Array<{ from: string; spec: string; levels: number }>;
  crossPackageNonPublic: Array<{ from: string; to: string; fromPkg: string; toPkg: string }>;
  totalFiles: number;
  totalEdges: number;
}

const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const strict = args.includes('--strict');

const report: Report = {
  cycles: [],
  layerViolations: [],
  deepDynImports: [],
  crossPackageNonPublic: [],
  totalFiles: 0,
  totalEdges: 0,
};

const files: string[] = [];
for (const dir of SCAN_DIRS) files.push(...walk(dir));
report.totalFiles = files.length;

const parsed = files.map(parseFile);
const edges = new Map<string, Set<string>>();
for (const f of parsed) edges.set(f.path, new Set());

for (const f of parsed) {
  for (const spec of [...f.staticDeps, ...f.dynDeps]) {
    const resolved = resolveSpecifier(f.path, spec);
    if (!resolved) continue;
    if (!edges.has(resolved)) continue; // outside scanned dirs (e.g., node_modules)
    edges.get(f.path)!.add(resolved);
    report.totalEdges++;

    // Layer violation: lower layer → higher layer (back-reference)
    // Layer 1 (utils) is the foundation; Layer 5 (CLI) is the top.
    // Allowed: Layer N → Layer M where N >= M (high depends on low or self).
    // Forbidden: Layer N → Layer M where N < M (low depends on high = back-ref).
    const fromLayer = getLayer(f.path);
    const toLayer = getLayer(resolved);
    if (fromLayer < toLayer) {
      report.layerViolations.push({
        from: f.path,
        to: resolved,
        fromLayer,
        toLayer,
        reason: `Layer ${fromLayer} → Layer ${toLayer} (低层反向依赖高层)`,
      });
    }

    // Deep dynamic import: 3+ levels of `../`
    if (spec.startsWith('.')) {
      const levels = (spec.match(/\.\.\//g) ?? []).length;
      if (levels >= 3) {
        report.deepDynImports.push({ from: f.path, spec, levels });
      }
    }

    // Cross-package non-public: importing into packages/<pkg>/src/*/* (not /index.ts)
    const fromPkg = packageOf(f.path);
    const toPkg = packageOf(resolved);
    if (fromPkg && toPkg && fromPkg !== toPkg && !isPackagePublicEntry(resolved)) {
      report.crossPackageNonPublic.push({
        from: f.path,
        to: resolved,
        fromPkg,
        toPkg,
      });
    }
  }
}

// SCC
const sccs = findSCCs(files, edges);
report.cycles = sccs.filter(s => s.length > 1);

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`\n🔍 SCC + Layer Audit`);
  console.log(`   Files scanned: ${report.totalFiles}`);
  console.log(`   Edges:         ${report.totalEdges}`);
  console.log(`   Scan dirs:     ${SCAN_DIRS.join(', ')}`);
  console.log('');

  let failed = false;

  // 1. Cycles
  if (report.cycles.length === 0) {
    console.log('✅ 0 循环依赖 (SCC > 1 = 0)');
  } else {
    failed = true;
    console.log(`❌ ${report.cycles.length} 循环依赖:`);
    for (const cycle of report.cycles) {
      console.log(`   ${cycle.join(' → ')} → ${cycle[0]}`);
    }
  }

  // 2. Layer violations
  if (report.layerViolations.length === 0) {
    console.log('✅ 0 层违规 (低层反向依赖高层)');
  } else {
    failed = true;
    console.log(`❌ ${report.layerViolations.length} 层违规:`);
    for (const v of report.layerViolations.slice(0, 10)) {
      console.log(`   ${v.from} (L${v.fromLayer}) → ${v.to} (L${v.toLayer})`);
    }
    if (report.layerViolations.length > 10) {
      console.log(`   ... and ${report.layerViolations.length - 10} more`);
    }
  }

  // 3. Deep dynamic imports
  if (report.deepDynImports.length === 0) {
    console.log('✅ 0 深层动态 import (3+ 级 ../)');
  } else {
    if (strict) failed = true;
    console.log(`${strict ? '❌' : '⚠️ '} ${report.deepDynImports.length} 深层动态 import (3+ 级 ../):`);
    for (const d of report.deepDynImports.slice(0, 10)) {
      console.log(`   ${d.from}: ${d.spec} (${d.levels} 级)`);
    }
    if (report.deepDynImports.length > 10) {
      console.log(`   ... and ${report.deepDynImports.length - 10} more`);
    }
    if (!strict) {
      console.log('   (用 --strict 把这变成错误)');
    }
  }

  // 4. Cross-package non-public
  if (report.crossPackageNonPublic.length === 0) {
    console.log('✅ 0 跨包非公开路径 (packages/<pkg>/src/*/* 不是 index)');
  } else {
    if (strict) failed = true;
    console.log(`${strict ? '❌' : '⚠️ '} ${report.crossPackageNonPublic.length} 跨包非公开依赖:`);
    for (const c of report.crossPackageNonPublic.slice(0, 10)) {
      console.log(`   ${c.fromPkg} → ${c.toPkg}: ${c.from} → ${c.to}`);
    }
    if (report.crossPackageNonPublic.length > 10) {
      console.log(`   ... and ${report.crossPackageNonPublic.length - 10} more`);
    }
    if (!strict) {
      console.log('   (用 --strict 把这变成错误)');
    }
  }

  console.log('');
  if (failed) {
    console.log('❌ SCC + Layer 审计失败');
    process.exit(1);
  }
  console.log('✅ SCC + Layer 审计全部通过');
}
