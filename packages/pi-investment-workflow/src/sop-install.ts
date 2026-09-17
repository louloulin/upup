/**
 * SOP install / uninstall — the "download a methodology into ~/.upup" path.
 *
 * Everything a user installs lands under the UpUp home root
 * (`$UPUP_HOME` when set, else `~/.upup`) so the same command works in a
 * sandboxed install, a container, or CI without mutating the developer's real
 * `~/.upup`:
 *
 *   /sop install https://example.com/my-sop.yaml     → ~/.upup/sops/my-sop.yaml
 *   /sop install ./sops/local.yaml                   → ~/.upup/sops/local.yaml
 *   /sop install ./team-sops/                        → ~/.upup/sops/*.yaml
 *   /sop install builtin:graham                      → ~/.upup/sops/graham.yaml
 *   /sop install ./sops/ --project                   → <cwd>/.upup/sops/*.yaml
 *   /sop new my-methodology                          → ~/.upup/sops/my-methodology.yaml
 *
 * Installing is fail-closed: every SOP is parsed, schema-validated, and checked
 * against the agent catalog *before* anything is written, so a broken YAML can
 * never take down `/invest`. Existing files are never overwritten unless
 * `force` is set.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import type { UpUpAgentSpec } from '@upup/pi-runtime';
import { INVESTMENT_PROFILES } from './agent-spec';
import {
  listBuiltinSopFiles,
  parseSopYaml,
  resolveBuiltinSopsDir,
  resolveUpUpHomeRoot,
  type SopLoaderOptions,
} from './sop-loader';
import { validateAgentCatalogForSop, validateSopSpec, type SopSpec } from './sop-spec';

export type SopInstallScope = 'user' | 'project';

export interface SopInstallOptions {
  /** `user` → `$UPUP_HOME/sops`, `project` → `<cwd>/.upup/sops`. Defaults to `user`. */
  readonly scope?: SopInstallScope;
  /** Overwrite an existing file with the same SOP id. Defaults to `false`. */
  readonly force?: boolean;
  readonly cwd?: string;
  readonly home?: string;
  readonly upupHome?: string;
  /** Extra agent specs (e.g. user-defined) used to validate agent references. */
  readonly agents?: readonly UpUpAgentSpec[];
  /** Injectable fetch for tests and offline runs. */
  readonly fetchImpl?: typeof globalThis.fetch;
}

export interface SopInstallRecord {
  readonly id: string;
  readonly path: string;
  readonly scope: SopInstallScope;
  readonly source: string;
  readonly bytes: number;
}

export interface SopInstallResult {
  readonly targetDir: string;
  readonly installed: readonly SopInstallRecord[];
  /** SOP ids left untouched because a file with that id already existed. */
  readonly skipped: readonly string[];
}

export interface SopUninstallResult {
  readonly id: string;
  readonly removed: boolean;
  readonly path: string;
  readonly reason?: 'not-found' | 'invalid-id';
}

export interface SopInstallTargets {
  readonly userDir: string;
  readonly projectDir: string;
  readonly builtinDir: string | null;
}

/** Raw YAML payload discovered from a source, before validation. */
export interface SopSourcePayload {
  readonly name: string;
  readonly content: string;
  readonly source: string;
}

const SOP_ID_RE = /^[a-z0-9][a-z0-9._-]*$/;

/** Resolve both install scopes plus the built-in payload directory. */
export function sopInstallTargets(options: SopInstallOptions = {}): SopInstallTargets {
  const cwd = options.cwd ?? process.cwd();
  return {
    userDir: join(resolveUpUpHomeRoot(options as SopLoaderOptions), 'sops'),
    projectDir: join(cwd, '.upup', 'sops'),
    builtinDir: resolveBuiltinSopsDir(),
  };
}

/** Directory a scope writes into. */
export function sopInstallDirForScope(scope: SopInstallScope, options: SopInstallOptions = {}): string {
  const targets = sopInstallTargets(options);
  return scope === 'project' ? targets.projectDir : targets.userDir;
}

/** Absolute path of an installed SOP, or `null` when that scope has no file for it. */
export function installedSopPath(id: string, options: SopInstallOptions = {}): string | null {
  const targetDir = sopInstallDirForScope(options.scope ?? 'user', options);
  for (const ext of ['.yaml', '.yml']) {
    const path = join(targetDir, `${id}${ext}`);
    if (existsSync(path)) return path;
  }
  return null;
}

function knownAgentIds(options: SopInstallOptions): ReadonlySet<string> {
  return validateAgentCatalogForSop([...Object.values(INVESTMENT_PROFILES), ...(options.agents ?? [])]);
}

function isYaml(name: string): boolean {
  return name.endsWith('.yaml') || name.endsWith('.yml');
}

function builtinIds(): readonly string[] {
  return listBuiltinSopFiles()
    .map((file) => basename(file).replace(/\.ya?ml$/, ''))
    .sort();
}

function readBuiltinPayload(id: string): readonly SopSourcePayload[] {
  const file = listBuiltinSopFiles().find((candidate) => basename(candidate).replace(/\.ya?ml$/, '') === id);
  if (!file) {
    throw new Error(`Unknown built-in SOP "${id}". Available: ${builtinIds().join(', ') || '(none)'}`);
  }
  return [{ name: basename(file), content: readFileSync(file, 'utf-8'), source: `builtin:${id}` }];
}

function readLocalPayloads(path: string): readonly SopSourcePayload[] {
  let stats;
  try {
    stats = statSync(path);
  } catch {
    throw new Error(`SOP source not found: ${path}`);
  }
  if (stats.isDirectory()) {
    const files = readdirSync(path).filter(isYaml).sort();
    if (files.length === 0) throw new Error(`No SOP YAML files in directory: ${path}`);
    return files.map((name) => ({
      name,
      content: readFileSync(join(path, name), 'utf-8'),
      source: join(path, name),
    }));
  }
  if (!isYaml(path)) throw new Error(`SOP source must be a .yaml/.yml file or a directory: ${path}`);
  return [{ name: basename(path), content: readFileSync(path, 'utf-8'), source: path }];
}

async function readRemotePayloads(url: string, options: SopInstallOptions): Promise<readonly SopSourcePayload[]> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('No fetch implementation available to download a remote SOP');
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Failed to download SOP ${url}: HTTP ${response.status}`);
  const content = await response.text();
  let name = 'sop.yaml';
  try {
    const candidate = basename(new URL(url).pathname);
    if (isYaml(candidate)) name = candidate;
  } catch {
    // A malformed URL still fetches fine through `fetch`; the SOP id drives the file name.
  }
  return [{ name, content, source: url }];
}

/**
 * Resolve any supported source string into raw SOP payloads. Performs no writes;
 * the SOP id in each payload decides the final file name.
 */
export async function readSopSource(source: string, options: SopInstallOptions = {}): Promise<readonly SopSourcePayload[]> {
  const trimmed = source.trim();
  if (!trimmed) throw new Error('SOP source is required (URL, file path, directory, or `builtin:<id>`)');
  if (/^https?:\/\//i.test(trimmed)) return readRemotePayloads(trimmed, options);
  if (trimmed.startsWith('builtin:')) return readBuiltinPayload(trimmed.slice('builtin:'.length).trim());

  const cwd = options.cwd ?? process.cwd();
  const asPath = resolve(cwd, trimmed);
  // A bare built-in id (`/sop install graham`) is shorthand for `builtin:graham`.
  if (!existsSync(asPath) && SOP_ID_RE.test(trimmed) && builtinIds().includes(trimmed)) {
    return readBuiltinPayload(trimmed);
  }
  return readLocalPayloads(asPath);
}

function writeAtomically(path: string, content: string): void {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, content, 'utf-8');
  renameSync(tmp, path);
}

/** Validate + persist already-resolved payloads. Throws before writing when any SOP is invalid. */
export function installSopPayloads(
  payloads: readonly SopSourcePayload[],
  options: SopInstallOptions = {},
): SopInstallResult {
  const scope = options.scope ?? 'user';
  const known = knownAgentIds(options);
  const validated = payloads.map((payload) => ({
    payload,
    spec: parseSopYaml(payload.content, payload.source) as SopSpec,
  }));
  for (const { payload, spec } of validated) {
    try {
      validateSopSpec(spec, known);
    } catch (error) {
      throw new Error(`${payload.source}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const targetDir = sopInstallDirForScope(scope, options);
  mkdirSync(targetDir, { recursive: true });

  const installed: SopInstallRecord[] = [];
  const skipped: string[] = [];
  for (const { payload, spec } of validated) {
    const path = join(targetDir, `${spec.id}.yaml`);
    if (existsSync(path) && !options.force) {
      skipped.push(spec.id);
      continue;
    }
    writeAtomically(path, payload.content);
    installed.push({
      id: spec.id,
      path,
      scope,
      source: payload.source,
      bytes: Buffer.byteLength(payload.content, 'utf-8'),
    });
  }
  return { targetDir, installed, skipped };
}

/**
 * Install every SOP carried by `source` into the target scope.
 * A single source may be a URL, a file, a directory, or `builtin:<id>`.
 */
export async function installSops(
  source: string | readonly string[],
  options: SopInstallOptions = {},
): Promise<SopInstallResult> {
  const sources = typeof source === 'string' ? [source] : source;
  const payloads: SopSourcePayload[] = [];
  for (const item of sources) payloads.push(...(await readSopSource(item, options)));
  return installSopPayloads(payloads, options);
}

/** Remove an installed SOP from the user or project scope. Built-ins are never touched. */
export function uninstallSop(id: string, options: SopInstallOptions = {}): SopUninstallResult {
  const targetDir = sopInstallDirForScope(options.scope ?? 'user', options);
  if (!SOP_ID_RE.test(id)) {
    return { id, removed: false, path: join(targetDir, `${id}.yaml`), reason: 'invalid-id' };
  }
  const path = installedSopPath(id, options);
  if (!path) return { id, removed: false, path: join(targetDir, `${id}.yaml`), reason: 'not-found' };
  rmSync(path, { force: true });
  return { id, removed: true, path };
}

/** Starter methodology written by `/sop new <id>` — valid as-is, meant to be edited. */
export function sopTemplateYaml(id: string): string {
  return [
    `id: ${id}`,
    `name: ${id}`,
    'description: |',
    '  在这里写清这套方法论要回答什么、适用哪个市场、什么条件下结论失效。',
    'version: 1.0.0',
    'market: any',
    'tags: []',
    'phases:',
    '  - id: detect',
    '    agent: invest-explore',
    '    intent: |',
    '      围绕 {ticker} 收集证据：财报关键科目、近年趋势、行业位置。',
    '      标注数据来源与报告期，不要给出投资建议。',
    '    outputContract: evidence',
    '  - id: plan',
    '    agent: invest-plan',
    '    intent: |',
    '      基于 detect 阶段的证据，给出 {ticker} 的判断、估值区间与关键假设。',
    '      缺失的数据必须写 "(n/a)"，禁止编造数字。',
    '    requires: [detect]',
    '    outputContract: report',
    '  - id: report',
    '    agent: invest-review',
    '    intent: |',
    '      产出 {ticker} 的最终报告：结论、主要风险、失效条件与后续跟踪项。',
    '      所有数字必须引用前序阶段的证据。',
    '    requires: [plan]',
    '    outputContract: report',
    '',
  ].join('\n');
}

/** Scaffold a new methodology (`/sop new <id>`); never overwrites unless `force`. */
export function scaffoldSop(id: string, options: SopInstallOptions = {}): SopInstallResult {
  if (!SOP_ID_RE.test(id)) {
    throw new Error(`Invalid SOP id "${id}" — use lowercase letters, digits, dot, dash or underscore`);
  }
  return installSopPayloads([{ name: `${id}.yaml`, content: sopTemplateYaml(id), source: `template:${id}` }], options);
}

/** Render an absolute path relative to the UpUp home root for display. */
export function displaySopPath(path: string, options: SopInstallOptions = {}): string {
  const root = resolve(resolveUpUpHomeRoot(options as SopLoaderOptions));
  return path.startsWith(root) ? `~/.upup${path.slice(root.length)}` : path;
}
