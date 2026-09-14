/**
 * code-archaeology 测试 — Sprint v4-1。
 * 覆盖:scanner / layer-detector / orphan-finder / hot-spot-finder / manifest-checker。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectLayer, refineLayer } from './layer-detector.js';
import { findOrphans } from './orphan-finder.js';
import { findHotspots } from './hot-spot-finder.js';
import { renderCodeMap } from './markdown-renderer.js';
import type { CodeMapReport, ScanResult, SourceFile } from './types.js';

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'code-archaeology-test-'));
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// layer-detector
// ---------------------------------------------------------------------------

describe('layer-detector', () => {
  test('L1 for src/runtime/pi/*', () => {
    expect(detectLayer('src/runtime/pi/runner.ts')).toBe('L1');
    expect(detectLayer('src/runtime/pi/role-system.ts')).toBe('L1');
  });

  test('L2 for src/tools/* and src/skills/*', () => {
    expect(detectLayer('src/tools/foo/bar.ts')).toBe('L2');
    expect(detectLayer('src/skills/dcf/index.ts')).toBe('L2');
  });

  test('L3 for Pi-backed multi-agent orchestration', () => {
    expect(detectLayer('src/multi-agent/agent-factory.ts')).toBe('L3');
    expect(detectLayer('src/subagent/runner.ts')).toBe('L3');
  });

  test('L4 for packages/pi-bridge/*', () => {
    expect(detectLayer('packages/pi-bridge/src/server.ts')).toBe('L4');
    expect(detectLayer('packages/daemon/src/index.ts')).toBe('L4');
  });

  test('L5 for src/kairos/*, src/coach/*, src/telemetry/*', () => {
    expect(detectLayer('src/kairos/proactive.ts')).toBe('L5');
    expect(detectLayer('src/coach/memory.ts')).toBe('L5');
    expect(detectLayer('src/telemetry/events.ts')).toBe('L5');
  });

  test('other for unknown paths', () => {
    expect(detectLayer('src/utils/foo.ts')).toBe('other');
    expect(detectLayer('src/types.ts')).toBe('other');
  });

  test('refineLayer: import-based 推断', () => {
    const content = `import { runPiPrompt } from '../../runtime/pi/runner.js';`;
    expect(refineLayer('src/utils/x.ts', 'other', content)).toBe('L1');
  });
});

// ---------------------------------------------------------------------------
// orphan-finder
// ---------------------------------------------------------------------------

describe('orphan-finder', () => {
  function makeFile(relPath: string, loc: number, opts: Partial<SourceFile> = {}): SourceFile {
    return {
      path: join(tmpRoot, relPath),
      relPath,
      bytes: 100,
      loc,
      exports: opts.exports ?? [],
      imports: opts.imports ?? [],
      layer: opts.layer ?? 'other',
      mtime: 0,
      hash: 'h',
    };
  }

  test('no-inbound: 文件无 inbound import', () => {
    const a = makeFile('src/foo.ts', 50, { exports: [{ name: 'foo', kind: 'function', line: 1 }] });
    const scan: ScanResult = { root: tmpRoot, scannedAt: '', totalFiles: 1, totalLoc: 50, totalBytes: 100, files: [a], errors: [] };
    const orphans = findOrphans(scan);
    expect(orphans.find((o) => o.relPath === 'src/foo.ts')?.reason).toBe('no-inbound');
  });

  test('entry file 被排除', () => {
    const entry = makeFile('src/index.tsx', 100, { exports: [], imports: [] });
    const scan: ScanResult = { root: tmpRoot, scannedAt: '', totalFiles: 1, totalLoc: 100, totalBytes: 100, files: [entry], errors: [] };
    const orphans = findOrphans(scan);
    expect(orphans).toHaveLength(0);
  });

  test('short file marked empty', () => {
    const a = makeFile('src/tiny.ts', 3);
    const scan: ScanResult = { root: tmpRoot, scannedAt: '', totalFiles: 1, totalLoc: 3, totalBytes: 50, files: [a], errors: [] };
    const orphans = findOrphans(scan);
    expect(orphans.find((o) => o.relPath === 'src/tiny.ts')?.reason).toBe('empty');
  });

  test('inbound file 不在 orphan 列表', () => {
    const a = makeFile('src/util.ts', 50, { exports: [{ name: 'util', kind: 'const', line: 1 }] });
    const b = makeFile('src/used.ts', 30, {
      imports: [{ raw: './util', resolved: join(tmpRoot, 'src/util.ts'), external: false }],
      exports: [],
    });
    const scan: ScanResult = { root: tmpRoot, scannedAt: '', totalFiles: 2, totalLoc: 80, totalBytes: 200, files: [a, b], errors: [] };
    const orphans = findOrphans(scan);
    expect(orphans.find((o) => o.relPath === 'src/util.ts')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// hot-spot-finder
// ---------------------------------------------------------------------------

describe('hot-spot-finder', () => {
  function makeFile(relPath: string, loc: number, opts: Partial<SourceFile> = {}): SourceFile {
    return {
      path: join(tmpRoot, relPath),
      relPath,
      bytes: 100, loc,
      exports: opts.exports ?? [],
      imports: opts.imports ?? [],
      layer: opts.layer ?? 'other',
      mtime: 0, hash: 'h',
    };
  }

  test('top N by inbound count', () => {
    const popular = makeFile('src/popular.ts', 50);
    const a = makeFile('src/a.ts', 10, { imports: [{ raw: './popular', resolved: join(tmpRoot, 'src/popular.ts'), external: false }] });
    const b = makeFile('src/b.ts', 10, { imports: [{ raw: './popular', resolved: join(tmpRoot, 'src/popular.ts'), external: false }] });
    const c = makeFile('src/c.ts', 10, { imports: [{ raw: './popular', resolved: join(tmpRoot, 'src/popular.ts'), external: false }] });
    const scan: ScanResult = { root: tmpRoot, scannedAt: '', totalFiles: 4, totalLoc: 80, totalBytes: 400, files: [popular, a, b, c], errors: [] };
    const hotspots = findHotspots(scan, 20);
    expect(hotspots[0]?.relPath).toBe('src/popular.ts');
    expect(hotspots[0]?.inboundCount).toBe(3);
  });

  test('空 files 返回空数组', () => {
    const scan: ScanResult = { root: tmpRoot, scannedAt: '', totalFiles: 0, totalLoc: 0, totalBytes: 0, files: [], errors: [] };
    expect(findHotspots(scan)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// markdown-renderer
// ---------------------------------------------------------------------------

describe('markdown-renderer', () => {
  const baseReport: CodeMapReport = {
    root: '/repo',
    generatedAt: '2026-06-04T12:00:00Z',
    scan: {
      root: '/repo', scannedAt: '2026-06-04T12:00:00Z',
      totalFiles: 3, totalLoc: 200, totalBytes: 6000,
      files: [
        { path: '/repo/src/runtime/pi/a.ts', relPath: 'src/runtime/pi/a.ts', bytes: 200, loc: 100,
          exports: [{ name: 'A', kind: 'class', line: 1 }], imports: [],
          layer: 'L1', mtime: 0, hash: 'h' },
        { path: '/repo/src/tools/b.ts', relPath: 'src/tools/b.ts', bytes: 200, loc: 50,
          exports: [], imports: [], layer: 'L2', mtime: 0, hash: 'h' },
        { path: '/repo/src/utils/c.ts', relPath: 'src/utils/c.ts', bytes: 200, loc: 50,
          exports: [], imports: [], layer: 'other', mtime: 0, hash: 'h' },
      ],
      errors: [],
    },
    layers: [
      { layer: 'L1', fileCount: 1, totalLoc: 100, locPercent: 50, bytePercent: 33.3 },
      { layer: 'L2', fileCount: 1, totalLoc: 50, locPercent: 25, bytePercent: 33.3 },
      { layer: 'other', fileCount: 1, totalLoc: 50, locPercent: 25, bytePercent: 33.3 },
    ],
    manifestCoverage: [
      { groupId: 'realtime', title: 'Realtime', matchedFiles: 1, prefixes: ['realtime_'] },
    ],
    orphans: [
      { path: '/repo/src/utils/c.ts', relPath: 'src/utils/c.ts', layer: 'other', loc: 50, reason: 'no-inbound' },
    ],
    hotspots: [
        { path: '/repo/src/runtime/pi/a.ts', relPath: 'src/runtime/pi/a.ts', layer: 'L1', inboundCount: 5 },
    ],
    groups: [],
  };

  test('renders all required sections', () => {
    const md = renderCodeMap(baseReport);
    expect(md).toContain('# upup 代码地图');
    expect(md).toContain('## 5 Layer 分布');
    expect(md).toContain('## 模块清单');
    expect(md).toContain('## Top');
    expect(md).toContain('Hot Spots');
    expect(md).toContain('## Capability Manifest 命中度');
    expect(md).toContain('## Orphan 候选');
    expect(md).toContain('auto-generated by code-archaeology');
  });

  test('renders layer table correctly', () => {
    const md = renderCodeMap(baseReport);
    expect(md).toContain('L1 基础循环');
    expect(md).toContain('100'); // L1 LOC
    expect(md).toContain('50.0%'); // L1 locPercent
  });

  test('renders hot spots ranking', () => {
    const md = renderCodeMap(baseReport);
    expect(md).toContain('| 1 |');
    expect(md).toContain('src/runtime/pi/a.ts');
    expect(md).toContain('5'); // inboundCount
  });

  test('renders orphans', () => {
    const md = renderCodeMap(baseReport);
    expect(md).toContain('src/utils/c.ts');
    expect(md).toContain('no-inbound');
  });
});
