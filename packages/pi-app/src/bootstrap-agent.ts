/**
 * First-launch bootstrap for `~/.upup/agent/`.
 *
 * Pi Native migration: UpUp owns its own global Pi home (`~/.upup/agent`)
 * instead of sharing `~/.pi/agent`. Pi resolves that path through the
 * `PI_CODING_AGENT_DIR` env var, so pointing Pi at UpUp's home is a
 * configuration change, not a fork — see
 * `@upup/pi-resource-composition/agent-dir`.
 *
 * Bootstrap has two jobs, both idempotent:
 *
 *   1. **Seed** — on a fresh `~/.upup/agent`, carry over the user's existing
 *      Pi configuration (`~/.pi/agent`: settings, models, auth, themes,
 *      prompts, skills, extensions) so switching to UpUp never loses a
 *      working setup. Existing files are never overwritten.
 *   2. **Brand** — make sure the UpUp dark theme is installed and selected.
 *      An explicit custom theme choice is respected; only built-in Pi themes
 *      (`dark` / `light` / `auto` / absent) are replaced with `upup-dark`.
 *
 * Nothing here touches `@earendil-works/pi-coding-agent`; it only writes
 * files into the agent dir Pi already reads.
 */

import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { publishPiAgentDirEnv, resolveAgentDir, upupAgentDirFor } from '@upup/pi-resource-composition';

/**
 * 第三方 Pi package 里，UpUp 已经自带等价实现、且会和 UpUp 注册的同名工具冲突的
 * source 集合 —— 默认标记 `autoload: false`。
 *
 * 典型例子是 `npm:pi-web-access`：它注册 `web_search`，而 UpUp 的
 * `@upup/pi-research` extension 也注册 `web_search`。两者同时加载时 Pi 会直接
 * `Failed to load extension ... Tool "web_search" conflicts` 并按退出码 1 退出，
 * 整个 TUI 都起不来。需要时用 `upup plugin enable <source>` 显式打开（同时接受
 * 由此产生的工具名冲突）。
 *
 * `npm:pi-hermes-memory` 同理：它注册 `memory_get` / `memory_search` /
 * `memory_update`，而 `@upup/pi-platform` 的 platform memory 工具同名。这份
 * 冲突在 platform 工具真正注册之前一直不可见（工具没注册就没有冲突），所以它
 * 也属于"被 UpUp 自带能力取代、默认关闭"的集合。
 */
const UPUP_SUPERSEDED_SOURCES: ReadonlySet<string> = new Set([
  'npm:pi-web-access',
  'npm:pi-hermes-memory',
]);

/**
 * UpUp 推荐加载的 Pi extension 插件 source 集合。
 *
 * Bootstrap 时把已装的 npm 第三方包但**不在此集合**内的标记为
 * `autoload: false`，避免污染 system prompt 与启动 warning（如
 * `workflow-delivery`）。用户可通过 `upup plugin enable <source>` 显式启用。
 *
 * 推荐清单完整定义在 `@upup/pi-cli-bootstrap/recommended-plugins`，
 * 此处只放 source 字符串集合避免循环依赖。
 */
const UPUP_AUTOLOAD_SAFE_SOURCES: ReadonlySet<string> = new Set([
  'npm:pi-mcp-adapter',
  'npm:pi-subagents',
  'npm:pi-background-tasks',
  'npm:@narumitw/pi-goal',
  'npm:@juicesharp/rpiv-ask-user-question',
  'npm:@specode/pi-kimi-cu',
  'npm:@amaster.ai/pi-teamwork',
  'npm:@llmgates_api/pi-llmgates-provider',
]);

const UPUP_DARK_THEME_FILENAME = 'upup-dark.json';
const UPUP_DEFAULT_THEME = 'upup-dark';

/** Pi built-in themes that a branded install is allowed to replace. */
const REPLACEABLE_THEMES = new Set(['dark', 'light', 'auto']);

/**
 * Files carried over from a previous Pi home. Deliberately an allowlist:
 * sessions, caches, logs, managed binaries and npm state are regenerated
 * and would only bloat the new home.
 */
const SEED_FILES = ['settings.json', 'models.json', 'auth.json'] as const;
const SEED_DIRS = ['themes', 'prompts', 'skills', 'extensions'] as const;

/** Seeded files that may carry API keys / tokens; written owner-only (0600). */
const SECRET_FILES = new Set(['auth.json', 'models.json']);

/**
 * Bump Node's `EventEmitter.defaultMaxListeners` to silence the cosmetic
 * `MaxListenersExceededWarning` printed when >10 Pi package extensions
 * register one listener each on `upup.pi.capability.resolve.v1`. The
 * listeners are intentional; the warning has no diagnostic value for our
 * architecture.
 *
 * Lives in its own module so every entry point (CLI, stdio, bridge,
 * management, cron, daemon, eval, print) can import it once and the headroom
 * is installed before any `@earendil-works/pi-*` module constructs its own
 * `EventEmitter`.
 */
export const REQUIRED_MAX_LISTENERS = 64;

export function installMaxListenersHeadroom(): void {
  const globalScope = globalThis as { __upupMaxListenersInstalled?: boolean };
  if (globalScope.__upupMaxListenersInstalled) return;
  globalScope.__upupMaxListenersInstalled = true;
  // Node ≥ 14: `events.EventEmitter.defaultMaxListeners` is the default cap
  // applied when an emitter doesn't call `setMaxListeners` itself. Bumping it
  // before any `@earendil-works/pi-*` module loads means Pi's internal
  // `new EventEmitter()` (e.g. in `event-bus.js`) inherits the higher cap
  // without us forking Pi.
  const ee = require('node:events').EventEmitter as { defaultMaxListeners: number };
  if (ee.defaultMaxListeners < REQUIRED_MAX_LISTENERS) {
    ee.defaultMaxListeners = REQUIRED_MAX_LISTENERS;
  }
}

installMaxListenersHeadroom();

export interface BootstrapAgentOptions {
  /**
   * Caller-supplied environment (defaults to `process.env`).
   *
   * `resolveAgentDir` ranks `$UPUP_HOME` and `*_CODING_AGENT_DIR` above the
   * `home` argument, because those variables are explicit relocations of the
   * UpUp root. A test that wants `home` to decide therefore has to pass a
   * stripped env; passing this option keeps that explicit instead of mutating
   * the process-global environment.
   */
  readonly env?: NodeJS.ProcessEnv;
  /** Override the resolved home dir (defaults to `os.homedir()`). */
  readonly home?: string;
  /** Force a specific agent dir, bypassing `resolveAgentDir` precedence. */
  readonly agentDir?: string;
  /** Force a specific source for the theme file. Tests use this. */
  readonly themeSourcePath?: string;
  /** Source directory to seed from. Defaults to `UPUP_MIGRATE_FROM` or `~/.pi/agent`. */
  readonly seedFrom?: string;
  /** Disable seeding entirely (tests, read-only homes). */
  readonly skipSeed?: boolean;
}

export interface BootstrapAgentResult {
  readonly agentDir: string;
  readonly themeWritten: boolean;
  readonly settingsWritten: boolean;
  readonly skipped: boolean;
  /** Absolute source dir the agent dir was seeded from, when seeding ran. */
  readonly seededFrom?: string;
  /** Relative paths copied during seeding. */
  readonly seededPaths: readonly string[];
}

function defaultThemeSourcePath(): string {
  // The theme ships alongside this module. Under Bun `import.meta.url` points
  // at the source file `packages/pi-app/src/bootstrap-agent.ts`, so one `..`
  // reaches `packages/pi-app/themes/upup-dark.json`.
  const here = fileURLToPath(import.meta.url);
  return resolve(dirname(here), '..', 'themes', UPUP_DARK_THEME_FILENAME);
}

function readJsonIfExists(path: string): Record<string, unknown> | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function isFreshAgentDir(agentDir: string): boolean {
  if (existsSync(join(agentDir, 'settings.json'))) return false;
  const themesDir = join(agentDir, 'themes');
  if (existsSync(themesDir)) {
    try {
      if (readdirSync(themesDir).length > 0) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Copy the allowlisted Pi configuration into a fresh UpUp agent dir.
 * Never overwrites an existing target file.
 */
function seedAgentDir(sourceDir: string, agentDir: string): string[] {
  const copied: string[] = [];
  for (const name of SEED_FILES) {
    const source = join(sourceDir, name);
    const target = join(agentDir, name);
    if (!existsSync(source) || existsSync(target)) continue;
    try {
      copyFileSync(source, target);
      // The source may be world-readable; credentials never are.
      if (SECRET_FILES.has(name)) chmodSync(target, 0o600);
      copied.push(name);
    } catch {
      /* unreadable source — skip */
    }
  }
  for (const name of SEED_DIRS) {
    const source = join(sourceDir, name);
    if (!existsSync(source)) continue;
    let entries: string[];
    try {
      entries = readdirSync(source);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry === UPUP_DARK_THEME_FILENAME && name === 'themes') continue;
      const from = join(source, entry);
      const to = join(agentDir, name, entry);
      if (existsSync(to)) continue;
      try {
        if (!statSync(from).isFile()) continue;
        ensureDir(dirname(to));
        copyFileSync(from, to);
        copied.push(join(name, entry));
      } catch {
        /* skip unreadable entry */
      }
    }
  }
  return copied;
}

interface BootstrapContext {
  readonly agentDir: string;
  readonly themeSource: string;
  readonly seedSource: string | undefined;
}

function resolveContext(options: BootstrapAgentOptions): BootstrapContext {
  const env = options.env ?? process.env;
  const home = options.home ?? env.HOME ?? homedir();
  const agentDir = options.agentDir
    ? resolve(options.agentDir)
    : resolveAgentDir(process.cwd(), { env, home }).agentDir;
  const seedSource = options.skipSeed
    ? undefined
    : options.seedFrom ?? env.UPUP_MIGRATE_FROM?.trim() ?? join(home, '.pi', 'agent');
  const themeSource = options.themeSourcePath ?? defaultThemeSourcePath();
  return {
    agentDir,
    themeSource,
    seedSource: seedSource && seedSource !== agentDir ? seedSource : undefined,
  };
}

function prepareAgentDir(context: BootstrapContext): void {
  ensureDir(join(context.agentDir, 'themes'));
  ensureDir(join(context.agentDir, 'sessions'));
}

function runSeed(context: BootstrapContext): { seededFrom?: string; seededPaths: string[] } {
  const { seedSource, agentDir } = context;
  if (!seedSource || !existsSync(seedSource)) return { seededPaths: [] };
  if (basename(seedSource) === UPUP_DARK_THEME_FILENAME) return { seededPaths: [] };
  if (!isFreshAgentDir(agentDir)) return { seededPaths: [] };
  return { seededFrom: seedSource, seededPaths: seedAgentDir(seedSource, agentDir) };
}

function syncBundledTheme(themeSource: string, themePath: string): boolean {
  if (!themeSource || !existsSync(themeSource)) return false;
  const bundled = readFileSync(themeSource, 'utf8');
  if (!existsSync(themePath)) {
    writeFileSync(themePath, bundled, 'utf8');
    return true;
  }
  try {
    if (statSync(themeSource).mtimeMs > statSync(themePath).mtimeMs) {
      writeFileSync(themePath, bundled, 'utf8');
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function ensureUpupThemeSelected(settingsPath: string): boolean {
  const existing = readJsonIfExists(settingsPath);
  if (!existing) {
    writeFileSync(
      settingsPath,
      `${JSON.stringify(
        {
          theme: UPUP_DEFAULT_THEME,
          $schema:
            'https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/core/settings-schema.json',
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    return true;
  }
  const current = existing.theme;
  const isReplaceable = current === undefined || (typeof current === 'string' && REPLACEABLE_THEMES.has(current));
  if (!isReplaceable) return false;
  writeFileSync(settingsPath, `${JSON.stringify({ ...existing, theme: UPUP_DEFAULT_THEME }, null, 2)}\n`, 'utf8');
  return true;
}

const EMPTY_RESULT = (agentDir: string): BootstrapAgentResult => ({
  agentDir,
  themeWritten: false,
  settingsWritten: false,
  skipped: true,
  seededPaths: [],
});

/**
 * 把 settings.json 里已装但不在 UpUp 推荐清单内的 npm 第三方包标记为
 * `autoload: false`。返回是否真的修改了文件（idempotent）。
 *
 * 设计原则：
 *   1. 不删除任何包——保留用户的安装
 *   2. 推荐清单内的包保留 autoload=true（不影响用户已启用的功能）
 *   3. 非推荐包默认 autoload=false——用户需 `upup plugin enable <source>` 启用
 *   4. 已经是 autoload=false 的不动——避免重复写文件
 *
 * 这解决了：
 *   - `[workflow-delivery] no session-stable thenable send` warning
 *     （来自 npm:@quintinshaw/pi-dynamic-workflows）
 *   - 175 个外部 skill 从 ~/.agents/skills 注入 system prompt 的污染
 */
function disableNonRecommendedThirdPartyPackages(settingsPath: string): boolean {
  const existing = readJsonIfExists(settingsPath);
  if (!existing) return false;
  const rawPackages = existing.packages;
  if (!Array.isArray(rawPackages)) return false;

  let mutated = false;
  const nextPackages = rawPackages.map((entry) => {
    // 字符串形式：默认保留（Pi 的 settings manager 接受字符串 source），但
    // 会和 UpUp 自带工具撞名的包必须显式降级成 autoload:false。
    if (typeof entry === 'string') {
      if (!UPUP_SUPERSEDED_SOURCES.has(entry)) return entry;
      mutated = true;
      return { source: entry, autoload: false };
    }
    if (!entry || typeof entry !== 'object') return entry;
    const obj = entry as Record<string, unknown>;
    const source = typeof obj.source === 'string' ? obj.source : '';
    if (!source) return entry;
    // 已经是 autoload=false 的不动
    if (obj.autoload === false) return entry;
    // 被 UpUp 自带能力取代的包（工具撞名）优先于推荐清单：用户装过、
    // Pi 自动补成对象形式时也要降级。
    if (UPUP_SUPERSEDED_SOURCES.has(source)) {
      mutated = true;
      return { ...obj, autoload: false };
    }
    // 推荐清单内的包不动（被 UpUp 自带能力取代的包不在推荐清单里）
    if (UPUP_AUTOLOAD_SAFE_SOURCES.has(source)) return entry;
    mutated = true;
    return { ...obj, autoload: false };
  });

  if (!mutated) return false;
  writeFileSync(settingsPath, `${JSON.stringify({ ...existing, packages: nextPackages }, null, 2)}\n`, 'utf8');
  return true;
}

/**
 * 清掉历史版本写进 `settings.json.packages` 的 `builtin:@upup/<pkg>@<version>`
 * 条目。
 *
 * 这些条目是 Sprint A 的遗留：Pi 的 `parseSource()` 只认 `npm:` / `git:` /
 * 真实本地路径，遇到未知前缀会退化成 `{ type: 'local', path: source }`，于是
 * `builtin:@upup/pi-finance-sdk@0.1.0` 被当成相对路径静默跳过 —— 写在设置里看着
 * 像“已集成”，实际一个 extension 都没加载。真正的加载通道是 Pi 的 `-e`（见
 * `pi-native-cli.ts#resolveUpupExtensionPaths`），所以这里把失效条目删掉，
 * 避免误导用户以为可以靠 `autoload: false` 关掉 UpUp 自带包。
 *
 * Idempotent：没有 builtin 条目时不动文件。
 */
function dropDeadBuiltinPackageEntries(settingsPath: string): boolean {
  const existing = readJsonIfExists(settingsPath);
  const rawPackages = existing?.packages;
  if (!existing || !Array.isArray(rawPackages)) return false;
  const nextPackages = rawPackages.filter((entry) => {
    const source = typeof entry === 'string'
      ? entry
      : entry && typeof entry === 'object' && typeof (entry as Record<string, unknown>).source === 'string'
        ? (entry as Record<string, unknown>).source as string
        : undefined;
    return !(source?.startsWith('builtin:@upup/') ?? false);
  });
  if (nextPackages.length === rawPackages.length) return false;
  writeFileSync(settingsPath, `${JSON.stringify({ ...existing, packages: nextPackages }, null, 2)}\n`, 'utf8');
  return true;
}

/**
 * Bootstrap `~/.upup/agent/`. Safe to call on every process start: all steps
 * are idempotent and any I/O failure degrades to `skipped: true` so the CLI
 * still starts on a read-only `$HOME`.
 */
export function bootstrapUpupAgentSync(options: BootstrapAgentOptions = {}): BootstrapAgentResult {
  const context = resolveContext(options);
  try {
    prepareAgentDir(context);
  } catch {
    return EMPTY_RESULT(context.agentDir);
  }

  let seed: { seededFrom?: string; seededPaths: string[] };
  try {
    seed = runSeed(context);
  } catch {
    seed = { seededPaths: [] };
  }

  const themeWritten = syncBundledTheme(context.themeSource, join(context.agentDir, 'themes', UPUP_DARK_THEME_FILENAME));

  let settingsWritten = false;
  try {
    settingsWritten = ensureUpupThemeSelected(join(context.agentDir, 'settings.json'));
  } catch {
    return { ...EMPTY_RESULT(context.agentDir), seededPaths: seed.seededPaths, ...(seed.seededFrom ? { seededFrom: seed.seededFrom } : {}) };
  }

  // Sprint C：把不在 UpUp 推荐清单内的 npm 第三方包标记为 autoload=false。
  // 这是 idempotent 操作：已标记的包不会被改动；推荐清单内的包保留 autoload=true。
  // 用户已装的包不会被删除，只是默认不加载；通过 `upup plugin enable <source>` 启用。
  try {
    disableNonRecommendedThirdPartyPackages(join(context.agentDir, 'settings.json'));
  } catch {
    /* autoload 标记失败不影响启动 */
  }

  // 清掉历史遗留的 builtin:@upup/* 条目：Pi 无法解析它们，UpUp 现在通过
  // `-e` 直接加载自带包的 extension 目录。
  try {
    dropDeadBuiltinPackageEntries(join(context.agentDir, 'settings.json'));
  } catch {
    /* 清理失败不影响启动 */
  }

  return {
    agentDir: context.agentDir,
    themeWritten,
    settingsWritten,
    skipped: false,
    ...(seed.seededFrom ? { seededFrom: seed.seededFrom } : {}),
    seededPaths: seed.seededPaths,
  };
}

/** Async alias kept for callers that prefer `await`; the work is synchronous. */
export async function bootstrapUpupAgent(options: BootstrapAgentOptions = {}): Promise<BootstrapAgentResult> {
  const result = bootstrapUpupAgentSync(options);
  // Eagerly construct the singleton `ModelRuntime` so subsequent sessions
  // — factory path, ACP path, prompt-runner path, anything else that uses
  // `createPiNativeSessionOptions()` — see the runtime synchronously
  // through `tryGetUpupModelRuntime()`. Without this prefetch the first
  // ever session falls back to the static Pi catalog because the runtime
  // has not been built yet. Refresh is intentionally off: `models.json`
  // is loaded synchronously by `ModelConfig.load`, and the bundled Pi
  // catalog already covers every UpUp-default provider.
  try {
    const { getUpupModelRuntime } = await import('@upup/pi-runtime');
    await getUpupModelRuntime({ refreshOnCreate: false });
  } catch {
    // A failure here is non-fatal — sessions still get the built-in
    // catalog. The runtime is re-attempted lazily on the next session.
  }
  return result;
}

/** Canonical UpUp agent dir for a given home; re-exported for callers/tests. */
export { upupAgentDirFor };

/**
 * Single entry point used by every UpUp process start (interactive TUI, print,
 * stdio/RPC, gateway, cron, daemon):
 *
 *   1. resolve the canonical `~/.upup/agent` (or an explicit env override),
 *   2. publish it to **both** `UPUP_CODING_AGENT_DIR` and
 *      `PI_CODING_AGENT_DIR` so Pi's `getAgentDir()` agrees (Pi reads the
 *      former because UpUp ships a rebranded `piConfig.name = "upup"`), and
 *   3. bootstrap the directory (seed from a previous Pi home + UpUp theme).
 *
 * Must run before any `@earendil-works/pi-*` module is imported: Pi reads the
 * env var at module init. Returns the resolved agent dir.
 */
export function ensureUpupAgentDir(env: NodeJS.ProcessEnv = process.env): string {
  const resolved = publishPiAgentDirEnv({
    env,
    cwd: process.cwd(),
    home: env.HOME ?? homedir(),
  });
  bootstrapUpupAgentSync({ agentDir: resolved });
  return resolved;
}
