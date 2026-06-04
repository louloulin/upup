/**
 * Pill-style status labels for tasks.
 *
 * Renders a task's status + name as a short string for the CLI:
 *   "[OK]     local-shell:npm-test                  120ms"
 *   "[FAIL]   local-workflow:etl                    3500ms"
 *   "[...]    remote-agent:planning                 (running)"
 *   "[CANCEL] monitor-mcp:feeds                     12.0s"
 *
 * Layout: pill (9 wide) + name (35 wide) + duration — no separator
 * spaces, so the duration column lines up across rows. ANSI color
 * codes are NOT included — callers can colorize externally.
 */
import type { Task, TaskResult, TaskStatus } from './types.js';

const PILL_WIDTH = 9;
const NAME_WIDTH = 35;

const PILL: Record<TaskStatus, string> = {
  pending: '[...]',
  running: '[...]',
  completed: '[OK]',
  failed: '[FAIL]',
  cancelled: '[CANCEL]',
  timeout: '[TIMEOUT]',
};

/** Pad (or truncate) a pill string to PILL_WIDTH. */
function padPill(s: string): string {
  if (s.length >= PILL_WIDTH) return s.slice(0, PILL_WIDTH);
  return s + ' '.repeat(PILL_WIDTH - s.length);
}

/** Pad (or ellipsize) a name string to NAME_WIDTH. */
function padName(name: string): string {
  if (name.length <= NAME_WIDTH) return name + ' '.repeat(NAME_WIDTH - name.length);
  if (NAME_WIDTH <= 1) return name.slice(0, NAME_WIDTH);
  return name.slice(0, NAME_WIDTH - 1) + '\u2026';
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return s > 0 ? `${m}m${s}s` : `${m}m`;
}

/** Render a task (regardless of whether it has been started) as a pill label. */
export function pillLabel(task: Task): string {
  const status = task.status();
  const result = task.result();
  const pill = padPill(PILL[status]);
  const name = padName(task.name);
  if (status === 'pending') {
    return `${pill}${name}(pending)`;
  }
  if (status === 'running') {
    return `${pill}${name}(running)`;
  }
  if (result) {
    return `${pill}${name}${formatDuration(result.durationMs)}`;
  }
  return `${pill}${name}(${status})`;
}

/** Render just the status pill portion. */
export function pillOnly(status: TaskStatus): string {
  return padPill(PILL[status]);
}

/** Render a full label for a finished result, given the task's name + kind. */
export function pillFromResult(name: string, result: TaskResult): string {
  const status: TaskStatus = result.ok ? 'completed' : 'failed';
  return `${padPill(PILL[status])}${padName(name)}${formatDuration(result.durationMs)}`;
}
