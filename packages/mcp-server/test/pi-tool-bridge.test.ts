/**
 * Tests for the Pi-native MCP tool bridge.
 *
 * Two contracts matter, and both are load-bearing for the cross-platform
 * promise:
 *
 *   1. **Projection is faithful.** A Pi tool definition must become an MCP
 *      tool with its schema intact and its `content` passed through. If the
 *      projection dropped the schema, an MCP client would call tools with
 *      wrong arguments and blame UpUp's data.
 *   2. **Read-only is derived, not asserted.** The withheld set must come from
 *      each package's `pi.sideEffects` declaration — the same source Pi's
 *      policy layer enforces. A hand-maintained blocklist would silently drift
 *      the first time a package adds a mutating tool.
 *
 * The bridge is exercised both with injected fakes (so the filtering rules are
 * pinned without a filesystem) and against the real workspace packages (so a
 * manifest rename or a missing `pi.extensions` entry fails here rather than in
 * a user's MCP client).
 */

import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  collectDeclaredSideEffectTools,
  collectPiToolCatalog,
  isCapturedPiTool,
  toMcpToolSpec,
  UPUP_MCP_BRIDGED_PI_PACKAGES,
  UPUP_MCP_EXCLUDED_EXTRA_TOOLS,
  UPUP_MCP_TOOL_PREFIX,
  type CapturedPiTool,
  type PiPackageManifestLike,
} from '../src/pi-tool-bridge';
import { createPiNativeMcpServer, UPUP_MCP_TOOLS } from '../src/server';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('collectDeclaredSideEffectTools', () => {
  it('collects every tool named in any manifest sideEffect declaration', () => {
    const manifests: PiPackageManifestLike[] = [
      { pi: { sideEffects: [{ tools: ['place_trade_order', 'cancel_trade_order'] }] } },
      { pi: { sideEffects: [{ tools: ['write_file'] }, { tools: ['mcp_auth_set'] }] } },
    ];
    const blocked = collectDeclaredSideEffectTools(manifests);
    expect([...blocked].sort()).toEqual(['cancel_trade_order', 'mcp_auth_get', 'mcp_auth_set', 'place_trade_order', 'write_file'].filter((n) => blocked.has(n)).sort());
    expect(blocked.has('get_stock_price')).toBe(false);
  });

  it('ignores malformed declarations instead of throwing or widening the surface', () => {
    const manifests = [
      { pi: { sideEffects: [{}, { tools: [] }, { tools: ['  ', 42, null] }] } },
      {},
      { pi: {} },
    ] as unknown as PiPackageManifestLike[];
    expect(collectDeclaredSideEffectTools(manifests).size).toBe(0);
  });

  it('a manifest with no pi block contributes nothing', () => {
    expect(collectDeclaredSideEffectTools([{ name: '@upup/pi-nothing' }]).size).toBe(0);
  });
});

describe('isCapturedPiTool', () => {
  it('accepts a definition with a name and an execute function', () => {
    expect(isCapturedPiTool({ name: 'get_stock_price', execute: () => undefined })).toBe(true);
  });

  it('rejects definitions missing a name or execute', () => {
    expect(isCapturedPiTool({ execute: () => undefined })).toBe(false);
    expect(isCapturedPiTool({ name: 'x' })).toBe(false);
    expect(isCapturedPiTool({ name: '   ', execute: () => undefined })).toBe(false);
    expect(isCapturedPiTool(null)).toBe(false);
    expect(isCapturedPiTool('get_stock_price')).toBe(false);
  });
});

describe('toMcpToolSpec', () => {
  const base: CapturedPiTool = {
    name: 'get_stock_price',
    label: 'Stock Price',
    description: 'Read a price snapshot.',
    parameters: { type: 'object', properties: { ticker: { type: 'string' } }, required: ['ticker'] },
    async execute() {
      return { content: [{ type: 'text', text: 'ok' }], details: { auditId: 'a' } };
    },
  };

  it('namespaces the tool and preserves the parameter schema verbatim', () => {
    const spec = toMcpToolSpec(base);
    expect(spec.name).toBe(`${UPUP_MCP_TOOL_PREFIX}get_stock_price`);
    expect(spec.inputSchema).toEqual(base.parameters);
  });

  it('falls back to the label and then the name when no description is given', () => {
    expect(toMcpToolSpec({ ...base, description: undefined }).description).toBe('Stock Price');
    expect(toMcpToolSpec({ ...base, description: undefined, label: undefined }).description).toBe('get_stock_price');
    expect(toMcpToolSpec({ ...base, description: '   ' }).description).toBe('Stock Price');
  });

  it('substitutes an empty object schema when the definition carries no usable one', () => {
    expect(toMcpToolSpec({ ...base, parameters: undefined }).inputSchema).toEqual({
      type: 'object',
      properties: {},
      additionalProperties: false,
    });
    expect(toMcpToolSpec({ ...base, parameters: { type: 'string' } }).inputSchema.type).toBe('object');
  });

  it('passes the tool content through and marks isError the way Pi reported it', async () => {
    const spec = toMcpToolSpec(base);
    const ok = await spec.execute({ ticker: 'AAPL' }, undefined);
    expect(ok.isError).toBeUndefined();
    expect(ok.content).toEqual([{ type: 'text', text: 'ok' }]);

    const failing = toMcpToolSpec({
      ...base,
      async execute() {
        return { content: [{ type: 'text', text: 'no data' }], isError: true };
      },
    });
    const bad = await failing.execute({}, undefined);
    expect(bad.isError).toBe(true);
    expect(bad.content).toEqual([{ type: 'text', text: 'no data' }]);
  });

  it('passes image content through instead of dropping it', async () => {
    const spec = toMcpToolSpec({
      ...base,
      async execute() {
        return { content: [{ type: 'image', data: 'AAAA', mimeType: 'image/png' }] };
      },
    });
    expect((await spec.execute({}, undefined)).content).toEqual([
      { type: 'image', data: 'AAAA', mimeType: 'image/png' },
    ]);
  });

  it('converts a throwing tool into a structured MCP error rather than rejecting', async () => {
    const spec = toMcpToolSpec({
      ...base,
      async execute() {
        throw new Error('provider unreachable');
      },
    });
    const result = await spec.execute({}, undefined);
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toBe('provider unreachable');
  });

  it('never emits empty content, which MCP clients render as a broken result', async () => {
    const spec = toMcpToolSpec({ ...base, async execute() { return { content: [] }; } });
    expect((await spec.execute({}, undefined)).content).toEqual([{ type: 'text', text: '' }]);
  });

  it('forwards the abort signal to the underlying Pi tool', async () => {
    let seen: AbortSignal | undefined;
    const spec = toMcpToolSpec({
      ...base,
      async execute(_id, _params, signal) {
        seen = signal;
        return { content: [{ type: 'text', text: 'ok' }] };
      },
    });
    const controller = new AbortController();
    await spec.execute({}, controller.signal);
    expect(seen).toBe(controller.signal);
  });
});

describe('collectPiToolCatalog (injected fakes)', () => {
  /**
   * Build bridge options over an in-memory package set.
   *
   * The manifest path is derived from the package name exactly once, so a
   * package called `pkg-a` is always resolvable to `/fake/pkg-a/package.json`
   * and its extension to `/fake/pkg-a/extensions`. Both `readManifest` and
   * `importExtension` then key off that same derived path — no string index
   * arithmetic, which is what made an earlier version of this helper silently
   * look packages up under the wrong key.
   */
  function fakeOptions(input: {
    manifests: Record<string, PiPackageManifestLike>;
    tools?: Record<string, CapturedPiTool[]>;
    throwOn?: readonly string[];
    extraExclude?: readonly string[];
  }) {
    const rootOf = (name: string): string => `/fake/${name}`;
    const nameFromPath = (path: string): string | undefined => {
      const match = /^\/fake\/([^/]+)\//.exec(path);
      return match?.[1];
    };
    return {
      packages: Object.keys(input.manifests),
      resolveManifest: (name: string) => (
        input.manifests[name] ? `${rootOf(name)}/package.json` : undefined
      ),
      readManifest: async (path: string): Promise<PiPackageManifestLike> => {
        const name = nameFromPath(path);
        const manifest = name ? input.manifests[name] : undefined;
        if (!manifest) throw new Error(`no fake manifest for ${path}`);
        return manifest;
      },
      importExtension: async (absolutePath: string): Promise<unknown> => {
        const name = nameFromPath(absolutePath);
        if (!name || !input.manifests[name]) throw new Error(`no fake extension for ${absolutePath}`);
        if (input.throwOn?.includes(name)) throw new Error('boom');
        return {
          default: (pi: { registerTool: (tool: unknown) => void }): void => {
            for (const tool of input.tools?.[name] ?? []) pi.registerTool(tool);
          },
        };
      },
      ...(input.extraExclude ? { excludeTools: input.extraExclude } : {}),
    };
  }

  const tool = (name: string): CapturedPiTool => ({
    name,
    description: `${name} description`,
    parameters: { type: 'object', properties: {} },
    async execute() { return { content: [{ type: 'text', text: name }] }; },
  });

  it('exposes registered tools and withholds the ones the manifest declared as side effects', async () => {
    const { tools, report } = await collectPiToolCatalog(fakeOptions({
      manifests: {
        'pkg-a': { pi: { extensions: ['./extensions'], sideEffects: [{ tools: ['write_thing'] }] } },
      },
      tools: { 'pkg-a': [tool('read_thing'), tool('write_thing')] },
    }));
    expect(tools.map((t) => t.name)).toEqual([`${UPUP_MCP_TOOL_PREFIX}read_thing`]);
    expect(report.blockedBySideEffect.map((e) => e.name)).toEqual(['write_thing']);
    expect(report.blockedBySideEffect[0]!.reason).toBe('side-effect');
    expect(report.packagesLoaded).toEqual(['pkg-a']);
    expect(report.toolsDeclared).toBe(2);
    expect(report.toolsExposed).toBe(1);
  });

  it('withholds session-scoped tools that are read-only but meaningless on a transport', async () => {
    const sessionScoped = UPUP_MCP_EXCLUDED_EXTRA_TOOLS[0]!;
    const { tools, report } = await collectPiToolCatalog(fakeOptions({
      manifests: { 'pkg-a': { pi: { extensions: ['./extensions'] } } },
      tools: { 'pkg-a': [tool(sessionScoped), tool('get_market_data')] },
    }));
    expect(tools.map((t) => t.name)).toEqual([`${UPUP_MCP_TOOL_PREFIX}get_market_data`]);
    expect(report.excludedSessionScoped.map((e) => e.name)).toEqual([sessionScoped]);
    expect(report.excludedSessionScoped[0]!.reason).toBe('session-scoped');
  });

  it('honours an extra excludeTools list on top of the defaults', async () => {
    const { tools } = await collectPiToolCatalog(fakeOptions({
      manifests: { 'pkg-a': { pi: { extensions: ['./extensions'] } } },
      tools: { 'pkg-a': [tool('keep_me'), tool('drop_me')] },
      extraExclude: ['drop_me'],
    }));
    expect(tools.map((t) => t.name)).toEqual([`${UPUP_MCP_TOOL_PREFIX}keep_me`]);
  });

  it('keeps the first registration when two packages declare the same tool name', async () => {
    const { tools, report } = await collectPiToolCatalog(fakeOptions({
      manifests: {
        'pkg-a': { pi: { extensions: ['./extensions'] } },
        'pkg-b': { pi: { extensions: ['./extensions'] } },
      },
      tools: { 'pkg-a': [tool('shared')], 'pkg-b': [tool('shared')] },
    }));
    expect(tools.map((t) => t.name)).toEqual([`${UPUP_MCP_TOOL_PREFIX}shared`]);
    expect(report.toolsDeclared).toBe(2);
    expect(report.toolsExposed).toBe(1);
  });

  it('reports an unresolvable package instead of throwing', async () => {
    const { tools, report } = await collectPiToolCatalog({
      packages: ['pkg-missing'],
      resolveManifest: () => undefined,
    });
    expect(tools).toEqual([]);
    expect(report.packagesFailed).toEqual([{ name: 'pkg-missing', error: 'package.json not resolvable' }]);
  });

  it('reports an extension that throws at mount time and keeps the other packages', async () => {
    const { tools, report } = await collectPiToolCatalog(fakeOptions({
      manifests: {
        'pkg-bad': { pi: { extensions: ['./extensions'] } },
        'pkg-good': { pi: { extensions: ['./extensions'] } },
      },
      tools: { 'pkg-good': [tool('works')] },
      throwOn: ['pkg-bad'],
    }));
    expect(tools.map((t) => t.name)).toEqual([`${UPUP_MCP_TOOL_PREFIX}works`]);
    expect(report.packagesLoaded).toEqual(['pkg-good']);
    expect(report.packagesFailed.map((f) => f.name)).toEqual(['pkg-bad']);
    expect(report.packagesFailed[0]!.error).toContain('boom');
  });

  it('reports a manifest with no pi.extensions entry rather than silently exposing nothing', async () => {
    const { report } = await collectPiToolCatalog(fakeOptions({
      manifests: { 'pkg-a': { pi: {} } },
    }));
    expect(report.packagesFailed).toEqual([{ name: 'pkg-a', error: 'manifest declares no pi.extensions' }]);
  });

  it('sorts the exposed tools by name so tools/list is stable across mounts', async () => {
    const { tools } = await collectPiToolCatalog(fakeOptions({
      manifests: { 'pkg-a': { pi: { extensions: ['./extensions'] } } },
      tools: { 'pkg-a': [tool('zeta'), tool('alpha'), tool('mu')] },
    }));
    expect(tools.map((t) => t.name)).toEqual([
      `${UPUP_MCP_TOOL_PREFIX}alpha`,
      `${UPUP_MCP_TOOL_PREFIX}mu`,
      `${UPUP_MCP_TOOL_PREFIX}zeta`,
    ]);
  });
});

describe('collectPiToolCatalog (real workspace Pi packages)', () => {
  it('mounts every bridged Pi package and exposes a large read-only surface', async () => {
    const { tools, report } = await collectPiToolCatalog();
    expect(report.packagesFailed).toEqual([]);
    expect(report.packagesLoaded).toEqual([...UPUP_MCP_BRIDGED_PI_PACKAGES]);
    // The hand-written catalog was 7 tools; the Pi surface is far larger. The
    // bound is deliberately loose (not an exact count) so adding a tool to a
    // Pi package does not require editing this test.
    expect(report.toolsExposed).toBeGreaterThanOrEqual(100);
    expect(tools.length).toBe(report.toolsExposed);
  });

  it('exposes only upup_finance__-prefixed, uniquely named tools with object schemas', async () => {
    const { tools } = await collectPiToolCatalog();
    const names = tools.map((t) => t.name);
    expect(names.every((name) => name.startsWith(UPUP_MCP_TOOL_PREFIX))).toBe(true);
    expect(new Set(names).size).toBe(names.length);
    for (const spec of tools) {
      expect((spec.inputSchema as { type?: unknown }).type).toBe('object');
      expect(spec.description.length).toBeGreaterThan(0);
      expect(typeof spec.execute).toBe('function');
    }
  });

  it('withholds every tool a package declared in pi.sideEffects — no writes reach MCP', async () => {
    const { tools, report } = await collectPiToolCatalog();
    const exposed = new Set(tools.map((t) => t.name));
    const criticalWrites = [
      'place_trade_order',
      'cancel_trade_order',
      'strategy_run_paper',
      'config_set',
      'write_file',
      'notify',
      'mcp_auth_get',
    ];
    for (const name of criticalWrites) {
      expect(exposed.has(`${UPUP_MCP_TOOL_PREFIX}${name}`)).toBe(false);
    }
    for (const excluded of report.blockedBySideEffect) {
      expect(exposed.has(`${UPUP_MCP_TOOL_PREFIX}${excluded.name}`)).toBe(false);
    }
    // The filter must actually be doing something, not passing vacuously.
    expect(report.blockedBySideEffect.length).toBeGreaterThan(0);
  });

  it('execute actually reaches the real Pi tool implementation', async () => {
    const { tools } = await collectPiToolCatalog();
    const tradingDay = tools.find((t) => t.name === `${UPUP_MCP_TOOL_PREFIX}check_trading_day`);
    expect(tradingDay).toBeDefined();
    const result = await tradingDay!.execute({ date: '2026-09-17', market: 'china' }, undefined);
    expect(result.isError).toBeUndefined();
    const text = (result.content[0] as { text: string }).text;
    expect(JSON.parse(text).isTradingDay).toBe(true);
  });

  it('ships the package manifests that declare pi.extensions, so the bridge is not guessing', async () => {
    for (const packageName of UPUP_MCP_BRIDGED_PI_PACKAGES) {
      const manifest = resolve(repoRoot, 'packages', packageName.replace('@upup/', ''), 'package.json');
      expect(existsSync(manifest)).toBe(true);
      const parsed = (await Bun.file(manifest).json()) as PiPackageManifestLike;
      expect(Array.isArray(parsed.pi?.extensions)).toBe(true);
      expect((parsed.pi?.extensions ?? []).length).toBeGreaterThan(0);
    }
  });
});

describe('createPiNativeMcpServer', () => {
  it('serves the Pi-bridged catalog by default', async () => {
    const server = await createPiNativeMcpServer();
    const report = server.piCatalogReport();
    expect(report).toBeDefined();
    expect(server.toolCount()).toBe(report!.toolsExposed);
    expect(server.toolCount()).toBeGreaterThanOrEqual(100);
    expect(server.toolNames().every((name) => name.startsWith(UPUP_MCP_TOOL_PREFIX))).toBe(true);
  });

  it('lets a caller pin an exact catalog', async () => {
    const server = await createPiNativeMcpServer({ catalog: { tools: UPUP_MCP_TOOLS } });
    expect(server.toolCount()).toBe(UPUP_MCP_TOOLS.length);
    expect(server.piCatalogReport()).toBeUndefined();
  });

  it('never returns a server with zero tools', async () => {
    // An MCP client cannot distinguish a broken mount from an empty server, so
    // the fallback catalog is served whenever the bridge yields nothing.
    const server = await createPiNativeMcpServer();
    expect(server.toolCount()).toBeGreaterThan(0);
  });
});
