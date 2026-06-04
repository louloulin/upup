/**
 * Code Archaeology — 类型定义 (Sprint v4-1 of top-tier-investment-claude-code-v4).
 *
 * 目标:把 upup 整个 src/ 扫成结构化数据,生成 docs/CODE-MAP.md + 模块依赖图。
 * 与 loucode "自动读 code + 总结" 能力对标。
 */
import type { CapabilityGroup } from '../agent/capability-manifest.js';

/** 5 层架构(来自 v3 claude-code-5layer spec) */
export type Layer = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'other';

/** 一个 import 解析结果 */
export interface ImportEdge {
  /** 原始 import 路径(如 './foo' / '../bar/baz' / 'node:fs') */
  raw: string;
  /** 解析后的绝对路径(仅相对路径,外部模块为 null) */
  resolved: string | null;
  /** 是否为外部/内置模块(react / node:fs / @scope/...) */
  external: boolean;
}

/** 一个 export 解析结果 */
export interface ExportSymbol {
  /** 导出名(匿名 default 用 'default') */
  name: string;
  /** 种类 */
  kind: 'const' | 'let' | 'var' | 'function' | 'class' | 'interface' | 'type' | 'enum' | 'default' | 're-export';
  /** 起始行号(1-based) */
  line: number;
}

/** 扫描出的一个源文件 */
export interface SourceFile {
  /** 绝对路径 */
  path: string;
  /** 相对 repo 根的路径 */
  relPath: string;
  /** 文件大小字节 */
  bytes: number;
  /** 代码行数(非空非注释粗估) */
  loc: number;
  /** exports 列表 */
  exports: ExportSymbol[];
  /** imports 列表 */
  imports: ImportEdge[];
  /** 解析后的 5 layer */
  layer: Layer;
  /** 文件 mtime(ms since epoch) */
  mtime: number;
  /** SHA-1 hash(用于增量缓存) */
  hash: string;
}

/** 完整扫描结果 */
export interface ScanResult {
  /** repo 根 */
  root: string;
  /** 扫描时间(ISO) */
  scannedAt: string;
  /** 文件总数 */
  totalFiles: number;
  /** 总 LOC */
  totalLoc: number;
  /** 总字节 */
  totalBytes: number;
  /** 文件列表 */
  files: SourceFile[];
  /** 错误列表(读不到/解析失败的文件) */
  errors: Array<{ path: string; error: string }>;
}

/** 缓存文件(增量模式) */
export interface ScanCache {
  version: 1;
  lastScanAt: string;
  files: Record<string, { hash: string; mtime: number }>;
}

/** 层分布统计 */
export interface LayerStat {
  layer: Layer;
  fileCount: number;
  totalLoc: number;
  locPercent: number;
  bytePercent: number;
}

/** capability-manifest 命中度 */
export interface ManifestCoverage {
  groupId: string;
  title: string;
  /** 命中的 tool 文件数(从 prefixes 推断) */
  matchedFiles: number;
  /** prefixes 列表 */
  prefixes: string[];
}

/** 死文件候选(无 import 也无 export 被引用) */
export interface OrphanCandidate {
  path: string;
  relPath: string;
  layer: Layer;
  loc: number;
  /** 推断的可能原因 */
  reason: 'no-inbound' | 'no-outbound-and-no-export' | 'empty';
}

/** hot spot(import 多的文件) */
export interface Hotspot {
  path: string;
  relPath: string;
  layer: Layer;
  inboundCount: number;
}

/** 完整 Code Map 报告 */
export interface CodeMapReport {
  root: string;
  generatedAt: string;
  scan: ScanResult;
  layers: LayerStat[];
  manifestCoverage: ManifestCoverage[];
  orphans: OrphanCandidate[];
  hotspots: Hotspot[];
  /** 顶层 groups(从 capability-manifest 引用) */
  groups: Array<Pick<CapabilityGroup, 'id' | 'title'> & { layer?: string }>;
}
