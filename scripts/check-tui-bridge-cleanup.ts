/**
 * check:tui-bridge-cleanup — Sprint 1+4 Pi Native cleanup gate.
 *
 * Confirms the legacy self-implemented TUI shell and bridge transport
 * packages are completely removed from the workspace. The Pi-native
 * migration plan (`pasted-text-1.txt`) targets:
 *
 *   - `packages/pi-tui-app/` — ~38K lines of self-rolled Ink components,
 *     permissions UI, slash-command autocomplete, model selector, session
 *     selector. Replaced by Pi `InteractiveMode` + extension components.
 *   - `packages/pi-bridge/` — ~3.6K lines of self-rolled WebSocket bridge
 *     with bespoke JSON envelope. Replaced by Pi `pi-protocol` CBOR +
 *     `pi-client`/`pi-server`.
 *   - `packages/pi-stdio/` — ~1.5K lines of self-rolled JSON-RPC over
 *     stdin/stdout. Replaced by Pi `runRpcMode` (via `main() --mode rpc`).
 *   - `packages/pi-platform/src/bash/` — ~4.5K lines of self-rolled bash
 *     command classifier, permission mode, AST parser, path validation,
 *     formatter, output processors. Replaced by Pi `tools/bash.ts` +
 *     `core/bash-executor.ts`.
 *   - `packages/pi-platform/src/sandbox/` — ~1.5K lines of self-rolled
 *     sandbox manager + rule compiler. Replaced by Pi `core/policy`.
 *
 * This gate hard-fails if any of these paths reappears.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');

const FORBIDDEN_PATHS: readonly { readonly path: string; readonly reason: string }[] = [
  { path: 'packages/pi-tui-app', reason: 'Pi InteractiveMode replaced the legacy Ink TUI shell' },
  { path: 'packages/pi-bridge', reason: 'Pi pi-protocol/pi-client/pi-server replaced the self-rolled WS bridge' },
  { path: 'packages/pi-stdio', reason: 'Pi runRpcMode (via main() --mode rpc) replaced the JSON stdio envelope' },
  { path: 'packages/pi-platform/src/bash', reason: 'Pi tools/bash.ts replaced the self-rolled bash classifier' },
  { path: 'packages/pi-platform/src/sandbox', reason: 'Pi core/policy replaced the self-rolled sandbox manager' },
  { path: 'packages/state', reason: 'Pi AgentSession.state replaced the AppState EventEmitter' },
  { path: 'packages/keybindings', reason: 'Pi core/keybindings.ts replaced the legacy keybindings parser' },
  { path: 'packages/hooks', reason: "Pi pi.on('tool_call') replaced the hooks event bus" },
  { path: 'packages/i18n', reason: 'Pi extension prompt 多语言 replaced the legacy strings.ts table' },
  { path: 'packages/pi-finance-composition', reason: 'Pi DefaultPackageManager replaced bespoke composition' },
  { path: 'packages/pi-platform-composition', reason: 'Pi DefaultPackageManager replaced bespoke composition' },
];

// Verify referenced scripts / configs are not leaking references to the
// deleted package names.
const SUSPICIENT_REFERENCES: readonly { readonly pattern: RegExp; readonly where: string }[] = [
  { pattern: /@upup\/pi-tui-app/, where: 'any ts/tsx source' },
  { pattern: /@upup\/pi-bridge/, where: 'any ts/tsx source' },
  { pattern: /@upup\/pi-stdio/, where: 'any ts/tsx source' },
  { pattern: /@upup\/state(?!\/)/, where: 'any ts/tsx source' },
  { pattern: /@upup\/keybindings/, where: 'any ts/tsx source' },
  { pattern: /@upup\/hooks/, where: 'any ts/tsx source' },
  { pattern: /@upup\/i18n/, where: 'any ts/tsx source' },
];

function* walk(dir: string, suffix: string[]): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full, suffix);
    else if (suffix.some((s) => entry.name.endsWith(s))) yield full;
  }
}

const missing = FORBIDDEN_PATHS.filter((p) => existsSync(join(ROOT, p.path)));
if (missing.length > 0) {
  console.error(`check:tui-bridge-cleanup FAIL — ${missing.length} forbidden path(s) still present:`);
  for (const m of missing) console.error(`  ✗ ${m.path} — ${m.reason}`);
  process.exit(1);
}

// Scan all package sources + root src for stale import references.
const offenders: { file: string; pattern: string }[] = [];
const SCAN_ROOTS = [join(ROOT, 'packages'), join(ROOT, 'src'), join(ROOT, 'scripts')];
const SCAN_SUFFIX = ['.ts', '.tsx'];
for (const root of SCAN_ROOTS) {
  if (!existsSync(root)) continue;
  for (const file of walk(root, SCAN_SUFFIX)) {
    let content: string;
    try { content = require('node:fs').readFileSync(file, 'utf-8'); } catch { continue; }
    for (const { pattern, where } of SUSPICIENT_REFERENCES) {
      if (pattern.test(content)) {
        offenders.push({ file: file.replace(ROOT + '/', ''), pattern: `${pattern} (in ${where})` });
      }
    }
  }
}

if (offenders.length > 0) {
  console.error(`check:tui-bridge-cleanup FAIL — ${offenders.length} stale reference(s) to deleted packages:`);
  for (const o of offenders.slice(0, 50)) console.error(`  ✗ ${o.file}: ${o.pattern}`);
  process.exit(1);
}

console.log(`check:tui-bridge-cleanup PASS — ${FORBIDDEN_PATHS.length} legacy paths removed, ${SUSPICIENT_REFERENCES.length} stale-reference patterns scanned.`);
