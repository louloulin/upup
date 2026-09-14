/**
 * Bash AST Parser — Structural command analysis for security
 *
 * Uses shell-quote for proper shell parsing (handles quoting, escaping).
 * Implements fail-closed semantics: anything unrecognized = too-complex.
 *
 * Reference: Loucode's src/utils/bash/ast.ts (tree-sitter based)
 * Our approach: shell-quote (pure JS) + structural classification
 */

import { parse as shellParse } from 'shell-quote';

// ============================================================================
// Types
// ============================================================================

export interface SimpleCommand {
  /** Parsed argv with proper quote handling */
  argv: string[];
  /** Original command text */
  text: string;
  /** Environment variable assignments (KEY=VALUE before command) */
  envVars: { name: string; value: string }[];
  /** Redirects detected (>, >>, <, 2>&1, etc.) */
  redirects: Redirect[];
}

export interface Redirect {
  type: '>' | '>>' | '<' | '2>' | '2>>' | '2>&1' | '&>' | '&>>';
  target: string;
}

export type ParseResult =
  | { kind: 'simple'; commands: SimpleCommand[] }
  | { kind: 'too-complex'; reason: string };

// ============================================================================
// Allowed structural types (fail-closed)
// ============================================================================

/** Shell operators we understand and can classify */
const KNOWN_SEPARATORS = new Set([';', '&&', '||', '|']);

/** Wrapper commands to strip before classification */
const WRAPPER_COMMANDS = new Set(['timeout', 'time', 'nice', 'nohup', 'command', 'env']);

/** Builtins that are always dangerous */
const DANGEROUS_BUILTINS = new Set(['eval', 'exec', 'source', '.']);

/** Safe env var prefixes (OK to leave in argv) */
const SAFE_ENV_PREFIXES = [
  'NODE_ENV=', 'CI=', 'DEBUG=', 'VERBOSE=',
  'GOOS=', 'GOARCH=', 'CGO_ENABLED=',
  'PYTHONPATH=', 'PYTHONDONTWRITEBYTECODE=',
];

// ============================================================================
// Parser
// ============================================================================

/**
 * Parse a shell command into structural components.
 * Returns 'too-complex' for anything we can't safely classify.
 */
export function parseForSecurity(command: string): ParseResult {
  const trimmed = command.trim();
  if (!trimmed) {
    return { kind: 'simple', commands: [] };
  }

  // Reject commands with shell features we can't parse safely
  const complexityCheck = checkComplexity(trimmed);
  if (complexityCheck) {
    return { kind: 'too-complex', reason: complexityCheck };
  }

  // Split on shell operators (&&, ||, ;, |)
  const segments = splitOnOperators(trimmed);
  const commands: SimpleCommand[] = [];

  for (const segment of segments) {
    if (KNOWN_SEPARATORS.has(segment.trim())) {
      continue; // Skip operators
    }

    const parsed = parseSegment(segment.trim());
    if (!parsed) {
      return { kind: 'too-complex', reason: `Failed to parse segment: ${segment.trim()}` };
    }
    commands.push(parsed);
  }

  return { kind: 'simple', commands };
}

/**
 * Strip wrapper commands (timeout, time, nice, nohup) from a command.
 * Applies iteratively until no more wrappers are found.
 */
export function stripWrappers(cmd: SimpleCommand): SimpleCommand {
  let argv = [...cmd.argv];
  let changed = true;

  while (changed && argv.length > 0) {
    changed = false;
    const first = argv[0];

    // Strip timeout with numeric arg FIRST: timeout 30 command ...
    if (first === 'timeout' && argv.length > 2 && /^\d+$/.test(argv[1])) {
      argv = argv.slice(2);
      changed = true;
      continue;
    }

    // Strip known wrappers (timeout without numeric arg, time, nice, etc.)
    if (WRAPPER_COMMANDS.has(first)) {
      argv = argv.slice(1);
      changed = true;
      continue;
    }

    // Strip leading env vars: NODE_ENV=production command ...
    if (first.includes('=') && /^[A-Z_][A-Z0-9_]*=/.test(first)) {
      argv = argv.slice(1);
      changed = true;
      continue;
    }
  }

  return { ...cmd, argv };
}

/**
 * Get the base command name from a SimpleCommand (after stripping wrappers).
 */
export function getBaseCommand(cmd: SimpleCommand): string | undefined {
  const stripped = stripWrappers(cmd);
  return stripped.argv[0];
}

/**
 * Check if a command uses a dangerous builtin.
 */
export function hasDangerousBuiltin(cmd: SimpleCommand): boolean {
  const base = getBaseCommand(cmd);
  return base ? DANGEROUS_BUILTINS.has(base) : false;
}

/**
 * Classify a command structurally using parsed argv.
 * Returns 'read' | 'write' | 'unknown'.
 */
export function classifyFromAST(cmd: SimpleCommand): 'read' | 'write' | 'unknown' {
  const stripped = stripWrappers(cmd);
  if (stripped.argv.length === 0) return 'unknown';

  const base = stripped.argv[0];
  const args = stripped.argv.slice(1);

  // Read-only commands
  const READ_COMMANDS = new Set([
    'ls', 'dir', 'pwd', 'cat', 'head', 'tail', 'less', 'more', 'view',
    'grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack',
    'find', 'locate', 'which', 'whereis', 'type',
    'stat', 'file', 'wc', 'md5sum', 'sha1sum', 'sha256sum',
    'diff', 'cmp', 'comm',
    'ps', 'top', 'htop', 'pidof', 'pgrep',
    'df', 'du', 'free', 'uptime', 'uname', 'hostname',
    'echo', 'printf',
    'sort', 'uniq', 'cut', 'tr', 'tee',  // tee is special but usually read-like
    'env', 'printenv', 'date', 'whoami', 'id',
    'curl', 'wget',  // read by default (write requires specific flags)
    'jq', 'xargs',
  ]);

  // Write commands
  const WRITE_COMMANDS = new Set([
    'rm', 'rmdir', 'unlink',
    'mkdir', 'touch', 'chmod', 'chown', 'chgrp',
    'mv', 'cp', 'ln',
    'sed', 'awk', 'perl', 'python', 'node', 'ruby',
    'tee', 'dd', 'shred',
    'tar', 'zip', 'unzip', 'gzip', 'gunzip',
    'git', 'svn', 'hg',
    'npm', 'yarn', 'pnpm', 'bun', 'pip', 'cargo',
    'docker', 'podman',
    'systemctl', 'service', 'launchctl',
    'kill', 'pkill', 'killall',
  ]);

  // Special: git subcommands
  if (base === 'git' && args.length > 0) {
    const subcommand = args[0];
    const gitReadCommands = new Set([
      'log', 'show', 'diff', 'status', 'branch', 'tag',
      'remote', 'describe', 'rev-parse', 'name-rev',
      'ls-files', 'ls-remote', 'cat-file', 'rev-list',
    ]);
    const gitWriteCommands = new Set([
      'add', 'commit', 'push', 'pull', 'fetch', 'merge',
      'rebase', 'checkout', 'switch', 'reset', 'clean',
      'stash', 'cherry-pick', 'revert', 'branch', 'tag',
    ]);

    if (gitReadCommands.has(subcommand)) return 'read';
    if (gitWriteCommands.has(subcommand)) return 'write';
    return 'unknown';
  }

  // Special: npm/yarn/pnpm/bun subcommands
  if (['npm', 'yarn', 'pnpm', 'bun'].includes(base) && args.length > 0) {
    const subcommand = args[0];
    const pkgReadCommands = new Set(['list', 'ls', 'info', 'view', 'outdated', 'doctor', 'why', 'audit']);
    if (pkgReadCommands.has(subcommand)) return 'read';
    return 'write'; // install, update, remove, etc.
  }

  // Special: docker subcommands
  if (base === 'docker' && args.length > 0) {
    const subcommand = args[0];
    const dockerReadCommands = new Set(['ps', 'images', 'logs', 'inspect', 'stats', 'top']);
    if (dockerReadCommands.has(subcommand)) return 'read';
    return 'write';
  }

  // Check for redirects to stdout (read-like) vs file (write-like)
  const hasFileRedirect = cmd.redirects.some(r =>
    r.type === '>' || r.type === '>>' || r.type === '2>' || r.type === '&>'
  );

  if (READ_COMMANDS.has(base)) {
    return hasFileRedirect ? 'write' : 'read';
  }

  if (WRITE_COMMANDS.has(base)) {
    return 'write';
  }

  return 'unknown';
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Check for shell features we can't safely parse.
 * Returns a reason string if too complex, null if OK.
 */
function checkComplexity(command: string): string | null {
  // Command substitution
  if (/\$\(/.test(command)) return 'Contains $() command substitution';
  if (/`[^`]+`/.test(command)) return 'Contains backtick command substitution';

  // Process substitution
  if (/[<>]\(/.test(command)) return 'Contains process substitution <() or >()';

  // Arithmetic expansion
  if (/\$\(\(/.test(command)) return 'Contains $(()) arithmetic expansion';

  // Here documents
  if (/<<-?\s*\w/.test(command)) return 'Contains here document';

  // Background execution (we allow this but flag it)
  // Not blocking: /&\s*$/.test(command)

  // Control structures
  if (/\b(if|then|else|elif|fi|for|while|until|do|done|case|esac|select)\b/.test(command)) {
    return 'Contains shell control structure';
  }

  // Function definitions
  if (/\w+\s*\(\s*\)\s*\{/.test(command)) return 'Contains function definition';
  if (/\{\s*$/.test(command.trim())) return 'Contains block opening';

  return null;
}

/**
 * Split a command on shell operators (&&, ||, ;, |).
 * Preserves the operators in the result for context.
 */
function splitOnOperators(command: string): string[] {
  const segments: string[] = [];
  let current = '';
  let i = 0;

  while (i < command.length) {
    const ch = command[i];

    // Handle quoted strings (don't split inside quotes)
    if (ch === "'" || ch === '"') {
      const quote = ch;
      current += ch;
      i++;
      while (i < command.length && command[i] !== quote) {
        current += command[i];
        i++;
      }
      if (i < command.length) {
        current += command[i]; // closing quote
        i++;
      }
      continue;
    }

    // Check for operators
    if (ch === '|' && command[i + 1] === '|') {
      if (current.trim()) segments.push(current.trim());
      segments.push('||');
      current = '';
      i += 2;
      continue;
    }
    if (ch === '&' && command[i + 1] === '&') {
      if (current.trim()) segments.push(current.trim());
      segments.push('&&');
      current = '';
      i += 2;
      continue;
    }
    if (ch === '|') {
      if (current.trim()) segments.push(current.trim());
      segments.push('|');
      current = '';
      i++;
      continue;
    }
    if (ch === ';') {
      if (current.trim()) segments.push(current.trim());
      segments.push(';');
      current = '';
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  if (current.trim()) {
    segments.push(current.trim());
  }

  return segments;
}

/**
 * Parse a single command segment into a SimpleCommand.
 * Handles env var assignments, redirects, and shell-quote parsing.
 */
function parseSegment(segment: string): SimpleCommand | null {
  try {
    // Extract redirects before parsing
    const { cleaned, redirects } = extractRedirects(segment);

    // Extract leading env var assignments
    const { envVars, remaining } = extractEnvVars(cleaned);

    // Parse with shell-quote
    const parsed = shellParse(remaining);

    // shell-parse returns (string | { op: string })[]
    // We only accept string[] for argv
    const argv: string[] = [];
    for (const token of parsed) {
      if (typeof token === 'string') {
        argv.push(token);
      } else if (typeof token === 'object' && 'op' in token) {
        // shell-quote operator tokens — shouldn't happen after our splitting
        // but if they do, it means the command is more complex than expected
        return null;
      }
    }

    return {
      argv,
      text: segment,
      envVars,
      redirects,
    };
  } catch {
    return null;
  }
}

/**
 * Extract redirect operators from a command string.
 */
function extractRedirects(command: string): { cleaned: string; redirects: Redirect[] } {
  const redirects: Redirect[] = [];
  let cleaned = command;

  // Match redirect patterns: >, >>, <, 2>, 2>>, 2>&1, &>, &>>
  const redirectPattern = /(\d*>>&?!?|&>>?)\s*(\S+)/g;
  let match;

  while ((match = redirectPattern.exec(command)) !== null) {
    const op = match[1];
    const target = match[2];

    let type: Redirect['type'];
    if (op === '2>&1') type = '2>&1';
    else if (op === '&>>') type = '&>>';
    else if (op === '&>') type = '&>';
    else if (op === '2>>') type = '2>>';
    else if (op === '2>') type = '2>';
    else if (op === '>>') type = '>>';
    else if (op === '>') type = '>';
    else if (op === '<') type = '<';
    else continue;

    redirects.push({ type, target });
  }

  // Remove redirects from the command for cleaner parsing
  cleaned = command.replace(/(\d*>>&?!?|&>>?)\s*\S+/g, '').trim();

  return { cleaned, redirects };
}

/**
 * Extract leading environment variable assignments.
 * e.g., "NODE_ENV=production DEBUG=1 command arg1" →
 *   envVars: [{NODE_ENV, production}, {DEBUG, 1}], remaining: "command arg1"
 */
function extractEnvVars(command: string): {
  envVars: { name: string; value: string }[];
  remaining: string;
} {
  const envVars: { name: string; value: string }[] = [];
  let remaining = command;

  const envPattern = /^([A-Z_][A-Z0-9_]*)=(\S+)\s*/i;

  while (true) {
    const match = remaining.match(envPattern);
    if (!match) break;

    const name = match[1];
    const value = match[2].replace(/^["']|["']$/g, ''); // strip quotes
    envVars.push({ name, value });
    remaining = remaining.slice(match[0].length);
  }

  return { envVars, remaining };
}
