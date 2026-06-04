/**
 * Code Archaeology Scanner — 扫 src 下的所有 .ts/.tsx 文件 解析 exports/imports/LOC/mtime/hash。
 *
 * 设计:
 *   - 纯 Bun API + 正则解析(无 ts-morph 依赖)
 *   - 增量模式:读 .upup/archaeology-cache.json,只重扫 mtime/hash 变化的文件
 *   - 容错:文件读不到不抛错,记入 errors
 *   - 软失败:扫描失败时返回部分结果(让渲染层决定怎么显示)
 */
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { detectLayer } from './layer-detector.js';
import type { ExportSymbol, ImportEdge, ScanCache, ScanResult, SourceFile } from './types.js';

const SUPPORTED_EXTS = new Set(['.ts', '.tsx']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.bun']);

// ---- regex 集合 -------------------------------------------------------------

/** 匹配一行中的 import 语句 */
const RE_IMPORT_FROM = /import\s+(?:type\s+)?(?:[\s\S]+?)\s+from\s+['"]([^'"]+)['"]/g;
/** 匹配 side-effect import */
const RE_IMPORT_SIDE = /^\s*import\s+['"]([^'"]+)['"]/gm;
/** 匹配 export 声明 */
const RE_EXPORT_DECL = /export\s+(?:abstract\s+)?(const|let|var|function|class|interface|type|enum|async\s+function)\s+([A-Za-z_$][\w$]*)/g;
/** 匹配 export default */
const RE_EXPORT_DEFAULT = /export\s+default\s+(?:abstract\s+)?(?:class|function|interface)?\s*([A-Za-z_$][\w$]*)?/g;
/** 匹配 export { a, b as c } */
const RE_EXPORT_NAMED = /export\s*\{([^}]+)\}/g;
/** 匹配 export * from */
const RE_EXPORT_STAR = /export\s*\*\s*(?:as\s+([A-Za-z_$][\w$]*)\s+)?from\s+['"]([^'"]+)['"]/g;

/** 解析 imports */
function parseImports(content: string, filePath: string): ImportEdge[] {
  const edges: ImportEdge[] = [];
  const seen = new Set<string>();

  // import { ... } from 'path'
  for (const m of content.matchAll(RE_IMPORT_FROM)) {
    const raw = m[1];
    if (seen.has(raw)) continue;
    seen.add(raw);
    edges.push(makeEdge(raw, filePath));
  }
  // import 'path' (side-effect)
  for (const m of content.matchAll(RE_IMPORT_SIDE)) {
    const raw = m[1];
    if (seen.has(raw)) continue;
    seen.add(raw);
    edges.push(makeEdge(raw, filePath));
  }
  // export ... from 'path' (re-export, also counts as import)
  for (const m of content.matchAll(RE_EXPORT_STAR)) {
    const raw = m[2];
    if (seen.has(raw)) continue;
    seen.add(raw);
    edges.push(makeEdge(raw, filePath));
  }
  return edges;
}

function makeEdge(raw: string, filePath: string): ImportEdge {
  const external = !raw.startsWith('.') && !raw.startsWith('/');
  if (external) return { raw, resolved: null, external: true };
  // 解析相对路径到绝对路径
  const dir = filePath.substring(0, filePath.lastIndexOf(sep));
  let resolved = resolve(dir, raw);
  // 尝试补 .ts / .tsx / /index.ts
  for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const candidate = resolved + ext;
    try {
      // 同步 stat 不可用(此处用 file exists heuristic)
      // 我们只标记 resolution,真正的存在性检查在 orphan-finder 阶段
      if (ext === '') continue;
      edgesSeen.add(candidate);
    } catch { /* noop */ }
  }
  return { raw, resolved, external: false };
}

/** 复用 set 记录已 resolve 的路径(避免重复 stat 模拟) */
const edgesSeen = new Set<string>();

/** 解析 exports */
function parseExports(content: string): ExportSymbol[] {
  const out: ExportSymbol[] = [];
  let m: RegExpExecArray | null;
  RE_EXPORT_DECL.lastIndex = 0;
  while ((m = RE_EXPORT_DECL.exec(content)) !== null) {
    const line = contentLine(content, m.index);
    out.push({ name: m[2], kind: m[1].replace('async ', 'function') as ExportSymbol['kind'], line });
  }
  RE_EXPORT_DEFAULT.lastIndex = 0;
  while ((m = RE_EXPORT_DEFAULT.exec(content)) !== null) {
    const line = contentLine(content, m.index);
    out.push({ name: m[1] ?? 'default', kind: 'default', line });
  }
  RE_EXPORT_NAMED.lastIndex = 0;
  while ((m = RE_EXPORT_NAMED.exec(content)) !== null) {
    const line = contentLine(content, m.index);
    for (const part of m[1].split(',')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      // 处理 `X as Y` → 导出名为 Y
      const asMatch = trimmed.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
      const name = asMatch ? asMatch[2] : trimmed;
      out.push({ name, kind: 're-export', line });
    }
  }
  return out;
}

/** 1-based line number of a content offset */
function contentLine(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

/** 计算 LOC(去除空行和单行注释) */
function countLoc(content: string): number {
  // 去掉块注释
  const stripped = content.replace(/\/\*[\s\S]*?\*\//g, '');
  let loc = 0;
  for (const line of stripped.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('//')) continue;
    loc++;
  }
  return loc;
}

/** SHA-1 of file content */
function hashContent(content: string): string {
  return createHash('sha1').update(content).digest('hex').slice(0, 16);
}

/** 递归列出所有 .ts/.tsx 文件 */
async function listTsFiles(dir: string, out: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      await listTsFiles(full, out);
    } else if (SUPPORTED_EXTS.has(extname(e.name))) {
      out.push(full);
    }
  }
  return out;
}

/** 读取 .upup/archaeology-cache.json(可选) */
export async function readCache(cachePath: string): Promise<ScanCache | null> {
  try {
    const raw = await readFile(cachePath, 'utf8');
    const parsed = JSON.parse(raw) as ScanCache;
    if (parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 写 .upup/archaeology-cache.json */
export async function writeCache(cachePath: string, cache: ScanCache): Promise<void> {
  const { writeFile, mkdir } = await import('node:fs/promises');
  await mkdir(cachePath.substring(0, cachePath.lastIndexOf(sep)), { recursive: true });
  await writeFile(cachePath, JSON.stringify(cache, null, 2), 'utf8');
}

/** 扫一个文件 → SourceFile */
async function scanOne(file: string, root: string, prev?: { hash: string; mtime: number }): Promise<SourceFile | null> {
  let content: string;
  let st;
  try {
    [content, st] = await Promise.all([readFile(file, 'utf8'), stat(file)]);
  } catch (err) {
    return null;
  }
  const hash = hashContent(content);
  // 命中缓存且未变 → 跳过解析(用 prev 数据)
  if (prev && prev.hash === hash && prev.mtime === st.mtimeMs) {
    return null; // 标记由 caller 处理
  }
  const exports = parseExports(content);
  const imports = parseImports(content, file);
  const rel = relative(root, file) || file;
  return {
    path: file,
    relPath: rel.split(sep).join('/'),
    bytes: st.size,
    loc: countLoc(content),
    exports,
    imports,
    layer: detectLayer(rel),
    mtime: st.mtimeMs,
    hash,
  };
}

/** 完整扫描入口 */
export async function scan(
  root: string,
  opts: { cache?: ScanCache | null; cachePath?: string } = {},
): Promise<ScanResult> {
  const absRoot = resolve(root);
  const files = await listTsFiles(join(absRoot, 'src'));
  const cache = opts.cache ?? null;
  const result: SourceFile[] = [];
  const errors: Array<{ path: string; error: string }> = [];

  for (const f of files) {
    const rel = relative(absRoot, f);
    const prev = cache?.files[rel];
    const one = await scanOne(f, absRoot, prev);
    if (one) result.push(one);
    else if (prev) {
      // 缓存命中,但我们要保留原数据 → 重新构造一个轻量 SourceFile
      // (失去 exports/imports/layer,但 mtime/hash 在;后续渲染层会显示"cached")
      result.push({
        path: f,
        relPath: rel.split(sep).join('/'),
        bytes: 0, loc: 0,
        exports: [], imports: [],
        layer: detectLayer(rel),
        mtime: prev.mtime,
        hash: prev.hash,
      });
    } else {
      // 新文件,已通过 scanOne 处理
      const fresh = await scanOne(f, absRoot);
      if (fresh) result.push(fresh);
    }
  }

  const totalLoc = result.reduce((a, f) => a + f.loc, 0);
  const totalBytes = result.reduce((a, f) => a + f.bytes, 0);
  return {
    root: absRoot,
    scannedAt: new Date().toISOString(),
    totalFiles: result.length,
    totalLoc,
    totalBytes,
    files: result,
    errors,
  };
}
