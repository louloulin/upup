#!/usr/bin/env bun
/**
 * check:pi-extension-coverage — prove UpUp uses Pi's ExtensionAPI surface
 * instead of inventing its own, and that the event surface stays complete.
 *
 * Hard failures (CI must stay green):
 *   - `PI_CANONICAL_EVENT_NAMES` drifts away from the installed Pi SDK.
 *   - `UPUP_EVENT_SURFACE` is missing a spec for any Pi event.
 *   - Any required ExtensionAPI method is not used in production sources.
 *   - The runtime mount does not subscribe to all 36 events.
 *
 * Reports (informational, never fail CI on these):
 *   - The full list of ExtensionAPI methods UpUp currently uses vs all 25.
 *   - Per-event role counts and behaviour/observe split.
 *   - Audit record volume from the live mount.
 *
 * The authoritative source is the installed `@earendil-works/pi-coding-agent`
 * SDK — the guard reads its `ExtensionAPI` `.d.ts` and derives both the event
 * list and the method list, so the guard never goes stale relative to Pi.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = process.cwd();
const PI_TYPES = resolve(ROOT, 'node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts');

const failures: string[] = [];
const usage: Record<string, number> = {};

function toNd(name: string): string | null {
  return name;
}

function piTypeSlice(): string {
  if (!existsSync(PI_TYPES)) {
    failures.push(`Cannot find Pi SDK types at ${PI_TYPES}; install @earendil-works/pi-coding-agent first.`);
    process.exit(1);
  }
  return readFileSync(PI_TYPES, 'utf-8');
}

function extractPiEventNames(types: string): string[] {
  const api = types.slice(types.indexOf('export interface ExtensionAPI'));
  return [...api.matchAll(/on\(event: "([a-z_]+)"/g)].map((match) => match[1] as string);
}

function extractPiMethodNames(types: string): string[] {
  const api = types.slice(types.indexOf('export interface ExtensionAPI'));
  const end = api.indexOf('\n}\n');
  const body = api.slice(0, end);
  // `on(event: "...", handler: ...)` shows up many times — dedup.
  const seen = new Set<string>();
  for (const match of body.matchAll(/^\s{4}(?:readonly )?([a-zA-Z_][A-Za-z0-9_]*)\s*[<(]/gm)) {
    const name = match[1] as string;
    if (name === 'on') continue;
    seen.add(name);
  }
  return [...seen];
}

function isProductionSource(path: string): boolean {
  return path.endsWith('.ts') && !path.endsWith('.test.ts') && !path.includes(`${'packages'}/dist/`);
}

function scanProductionSourceForMethods(): void {
  const packagesRoot = resolve(ROOT, 'packages');
  const roots = [packagesRoot, resolve(ROOT, 'src')];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    walk(root);
  }
}

function walk(dir: string): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      walk(full);
      continue;
    }
    if (!isProductionSource(full)) continue;
    const text = readFileSync(full, 'utf-8');
    for (const match of text.matchAll(/pi\.([A-Za-z_][A-Za-z0-9_]*)\(/g)) {
      const name = match[1] as string;
      if (name === 'on') continue; // events are covered separately
      usage[name] = (usage[name] ?? 0) + 1;
    }
  }
}

const types = piTypeSlice();
const piEvents = extractPiEventNames(types);
const piMethods = extractPiMethodNames(types);

// ---------------------------------------------------------------------------
// 1. Drift check: the list in @upup/pi-runtime matches the installed SDK.
// ---------------------------------------------------------------------------

const { PI_CANONICAL_EVENT_NAMES } = (await import(`${resolve(ROOT, 'packages/pi-runtime/src/index.ts')}`)) as {
  PI_CANONICAL_EVENT_NAMES: readonly string[];
};
if ([...PI_CANONICAL_EVENT_NAMES].length !== piEvents.length || PI_CANONICAL_EVENT_NAMES.some((name, index) => piEvents[index] !== name)) {
  failures.push(`PI_CANONICAL_EVENT_NAMES drifted from Pi SDK:\n  surface: ${[...PI_CANONICAL_EVENT_NAMES].join(', ')}\n  Pi SDK:  ${piEvents.join(', ')}`);
}

// ---------------------------------------------------------------------------
// 2. UPUP_EVENT_SURFACE covers every event with a role and stated use.
// ---------------------------------------------------------------------------

const surfaceModule = (await import(`${resolve(ROOT, 'packages/pi-runtime/src/index.ts')}`)) as {
  UPUP_EVENT_SURFACE: readonly { readonly name: string; readonly role: string; readonly upupUse: string; readonly behavior: boolean }[];
  mountUpUpEventSurface: (pi: { on: (event: string, handler: (event: unknown, context: unknown) => unknown) => void }) => {
    mounted: readonly string[]; behaviorBacked: readonly string[]; auditOnly: readonly string[];
  };
};
const { UPUP_EVENT_SURFACE, mountUpUpEventSurface } = surfaceModule;
if (UPUP_EVENT_SURFACE.length !== piEvents.length) {
  failures.push(`UPUP_EVENT_SURFACE has ${UPUP_EVENT_SURFACE.length} entries, expected ${piEvents.length}`);
}
const surfaceNames = new Set(UPUP_EVENT_SURFACE.map((spec) => spec.name));
for (const name of piEvents) {
  if (!surfaceNames.has(name)) failures.push(`UPUP_EVENT_SURFACE missing spec for Pi event "${name}"`);
}
for (const spec of UPUP_EVENT_SURFACE) {
  if (!spec.role || !spec.upupUse) failures.push(`UPUP_EVENT_SURFACE spec "${spec.name}" is missing role/upupUse`);
}

// ---------------------------------------------------------------------------
// 3. Live mount subscribes to every event.
// ---------------------------------------------------------------------------

const subscriptions = new Map<string, ((event: unknown, context: unknown) => unknown)[]>();
const fakePi = { on: (event: string, handler: (event: unknown, context: unknown) => unknown) => {
  const list = subscriptions.get(event) ?? [];
  list.push(handler);
  subscriptions.set(event, list);
} };
const mountResult = mountUpUpEventSurface(fakePi, { sink: () => undefined });
if (mountResult.mounted.length !== piEvents.length) {
  failures.push(`mountUpUpEventSurface subscribed to ${mountResult.mounted.length}/${piEvents.length} events`);
}

// ---------------------------------------------------------------------------
// 4. ExtensionAPI method coverage: every required method is used.
// ---------------------------------------------------------------------------

scanProductionSourceForMethods();
const requiredMethods = [
  'registerTool',
  'registerCommand',
  'registerFlag',
  'getFlag',
  'registerMarkdownTransformer',
  'setSessionName',
  'appendEntry',
  'sendMessage',
  'sendUserMessage',
  'getActiveTools',
  'setActiveTools',
];
const usedPiMethods = new Set(Object.keys(usage));
for (const required of requiredMethods) {
  if (!usedPiMethods.has(required)) failures.push(`Required Pi method "${required}" is not used in any production source`);
}
for (const piMethod of piMethods) {
  if (!usedPiMethods.has(piMethod)) usage[piMethod] = 0;
}

// ---------------------------------------------------------------------------
// 5. Report + exit.
// ---------------------------------------------------------------------------

const surface = UPUP_EVENT_SURFACE;
const behaviorBacked = surface.filter((spec) => spec.behavior).length;
const observeOnly = surface.length - behaviorBacked;
const byRole: Record<string, number> = {};
for (const spec of surface) byRole[spec.role] = (byRole[spec.role] ?? 0) + 1;

console.log(`check:pi-extension-coverage — events ${surface.length}/${piEvents.length} (behavior ${behaviorBacked}, observe ${observeOnly})`);
console.log(`  by role: ${Object.entries(byRole).map(([role, count]) => `${role}=${count}`).join('  ')}`);

const usedCount = piMethods.filter((name) => usedPiMethods.has(name)).length;
console.log(`  ExtensionAPI methods used: ${usedCount}/${piMethods.length}`);
const usedList = piMethods.filter((name) => usedPiMethods.has(name));
const unusedList = piMethods.filter((name) => !usedPiMethods.has(name));
console.log(`    used:   ${usedList.join(', ')}`);
console.log(`    unused: ${unusedList.join(', ')}`);

if (failures.length > 0) {
  console.error('\ncheck:pi-extension-coverage FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('check:pi-extension-coverage OK');

// Touch toNd so bun doesn't strip the helper.
void toNd;
void dirname;
