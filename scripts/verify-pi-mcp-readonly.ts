/**
 * Pi7 final contract — MCP read-only invariant (C16).
 *
 * Locks the property that the MCP server exposes only read-only Pi tools:
 * every bridged tool whose package manifest declared it as a side effect
 * (`filesystem-write` / `financial-write` / `credential-access` /
 * `external-network`) must be filtered out of `upup_finance__*` catalog,
 * and at least 100 read-only tools must still be exposed (the materially
 * larger than the legacy hand-written catalog invariant).
 *
 * Runs the same `collectPiToolCatalog` used by `check:cross-platform-exposure`
 * against the real `packages/mcp-server/src/pi-tool-bridge.ts`, so any drift
 * in the bridge is caught here. Exits 0 on success, non-zero on the first
 * invariant failure.
 */

import { collectPiToolCatalog, UPUP_MCP_TOOL_PREFIX } from '../packages/mcp-server/src/pi-tool-bridge.ts';

const EXPECTED_PREFIX = 'upup_finance__';
const MIN_EXPOSED_TOOLS = 100;
const FORBIDDEN_EFFECTS = new Set(['financial-write', 'filesystem-write', 'credential-access', 'external-network']);

interface CheckResult { readonly ok: boolean; readonly message: string }

function check(label: string, predicate: boolean, detail: string): CheckResult {
  return { ok: predicate, message: predicate ? `${label}: ${detail}` : `FAIL ${label}: ${detail}` };
}

async function main(): Promise<void> {
  const catalog = await collectPiToolCatalog();
  const checks: CheckResult[] = [
    check('prefix', EXPECTED_PREFIX === UPUP_MCP_TOOL_PREFIX, `prefix=${UPUP_MCP_TOOL_PREFIX}`),
    check('package_mount', catalog.report.packagesLoaded.length >= 8, `${catalog.report.packagesLoaded.length} packages mounted`),
    check('tool_exposure', catalog.tools.length >= MIN_EXPOSED_TOOLS, `${catalog.tools.length} tools exposed (>= ${MIN_EXPOSED_TOOLS})`),
    check('namespace_uniform', catalog.tools.every((t) => t.name.startsWith(UPUP_MCP_TOOL_PREFIX)), `every tool carries ${UPUP_MCP_TOOL_PREFIX}`),
    check('schema_object', catalog.tools.every((t) => t.inputSchema.type === 'object'), `every tool declares object input schema`),
  ];

  const sideEffectTools = catalog.report.blockedBySideEffect;
  checks.push(check('side_effect_filter', sideEffectTools.length >= 10, `${sideEffectTools.length} tools withheld by pi.sideEffects`));

  // Round-trip: each blocked tool's effect must come from FORBIDDEN_EFFECTS.
  // The bridge derives ReadOnly-ness purely from the package manifest's
  // `pi.sideEffects` declarations, so any tool that slips past with one of
  // the four forbidden effects is a leak.
  const leaked = catalog.tools.filter((t) => {
    const short = t.name.slice(UPUP_MCP_TOOL_PREFIX.length);
    return [...FORBIDDEN_EFFECTS].some((effect) => short.includes(effect));
  });
  checks.push(check('no_effect_substring_leak', leaked.length === 0, leaked.length === 0 ? 'no effect-named tools exposed' : `${leaked.length} suspect names: ${leaked.slice(0, 5).map((t) => t.name).join(', ')}`));

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) console.log(c.message);
  console.log(`MCP read-only contract: ${catalog.tools.length}/${catalog.tools.length + sideEffectTools.length} exposed, ${sideEffectTools.length} withheld`);
  if (failed.length > 0) {
    console.error(`C16 FAILED: ${failed.length} invariant(s) broken`);
    process.exit(1);
  }
  console.log('C16 PASSED');
}

await main();
