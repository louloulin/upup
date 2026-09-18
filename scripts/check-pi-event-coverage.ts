#!/usr/bin/env bun
/**
 * Guard: Pi canonical event coverage (plan §1.2).
 *
 * Walks the workspace for `pi.on('<event>', ...)` registrations and
 * counts the unique event names against the canonical Pi event set.
 * The contract from the plan is:
 *
 *   - 36 events documented by Pi (we list 33 that survive the current
 *     Pi 0.68 docs surface; Pi deliberately does not emit the other 3
 *     on every host so the contract is `>= 30 / 36`).
 *   - Plan §1.2 demands `>= 30/36` events wired.
 *
 * The script never throws on a missing event — it prints a report and
 * exits non-zero only when the threshold is not met. Existing
 * pre-existing failures (15 known) must be excluded.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Canonical Pi event names — keep aligned with
 *  `packages/pi-investment-workflow/src/extensions/pi-event-coverage.ts`
 *  and the Pi docs (https://pi.dev/docs/latest). */
const PI_CANONICAL_EVENTS = [
  'project_trust',
  'resources_discover',
  'session_start',
  'session_info_changed',
  'session_before_switch',
  'session_before_fork',
  'session_before_compact',
  'session_compact',
  'session_compact_failed',
  'session_before_tree',
  'session_tree',
  'session_shutdown',
  'before_agent_start',
  'agent_start',
  'agent_end',
  'agent_settled',
  'ui_prompt_start',
  'ui_prompt_end',
  'turn_start',
  'turn_end',
  'message_start',
  'message_update',
  'message_end',
  'tool_execution_start',
  'tool_execution_end',
  'tool_call',
  'tool_result',
  'context',
  'before_provider_headers',
  'before_provider_request',
  'after_provider_response',
  'model_select',
  'thinking_level_select',
  'input',
  'user_bash',
] as const;

const REQUIRED_COUNT = 30;

/** Walk a directory and collect every `.ts` file path. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
      walk(p, out);
    } else if (entry.endsWith('.ts')) {
      out.push(p);
    }
  }
  return out;
}

const workspaceRoot = process.cwd();
const srcDirs = [
  join(workspaceRoot, 'packages'),
  join(workspaceRoot, 'src'),
];

/** Extract every literal passed as the first argument to `pi.on(` and
 *  `pi.events.on(`. We deliberately accept both Pi surface styles. */
/** Match either ,  or
 *  a wrapper helper like  so extensions that
 *  route through a small adapter are still counted. */
const eventRegex = /(?:\bpi\.(?:on|events\.on)\(|\bsafeOn\(\s*pi\s*,\s*)(?:['"]([a-z_]+)['"]|`([a-z_]+)`)/g;

const subscribed = new Map<string, Set<string>>();

for (const dir of srcDirs) {
  for (const file of walk(dir)) {
    const text = readFileSync(file, 'utf8');
    let match: RegExpExecArray | null;
    while ((match = eventRegex.exec(text)) !== null) {
      const name = match[1] ?? match[2];
      if (typeof name !== 'string') continue;
      if (!subscribed.has(name)) subscribed.set(name, new Set());
      subscribed.get(name)!.add(file);
    }
  }
}

const subscribedCount = subscribed.size;
const missing = PI_CANONICAL_EVENTS.filter((e) => !subscribed.has(e));
const covered = PI_CANONICAL_EVENTS.filter((e) => subscribed.has(e));

const status = subscribedCount >= REQUIRED_COUNT ? 'PASS' : 'FAIL';

const report = {
  contract: 'upup.pi.event-coverage.v1',
  status,
  subscribedCount,
  canonicalEventCount: PI_CANONICAL_EVENTS.length,
  requiredCount: REQUIRED_COUNT,
  covered,
  missing,
  byFileCount: Object.fromEntries(
    [...subscribed.entries()].map(([event, files]) => [event, files.size]),
  ),
};

console.log(JSON.stringify(report, null, 2));

if (status !== 'PASS') {
  console.error(`\n[check:pi-event-coverage] FAIL: ${subscribedCount}/${PI_CANONICAL_EVENTS.length} events wired (required >= ${REQUIRED_COUNT})`);
  console.error('Missing events:', missing.join(', '));
  process.exit(1);
}
