/**
 * Command Classifier Module
 *
 * Classifies shell commands as read-only or write operations.
 * Used to determine if commands need user approval.
 *
 * Reference: Loucode's readOnlyValidation.ts and commandSemantics.ts
 */

import { extractBaseCommand } from './security';

// Re-export shared types
export type { CommandClassification, PermissionMode, CommandInfo } from './types';
import type { CommandClassification, PermissionMode, CommandInfo } from './types';

// ============================================================================
// Command Classifications
// ============================================================================

/**
 * Read-only commands that never modify the filesystem
 */
const READ_ONLY_COMMANDS = new Set([
  // Listing/Viewing
  'ls', 'dir', 'vdir', 'tree',
  'cat', 'head', 'tail', 'less', 'more', 'view',
  'od', 'hexdump', 'xxd',
  'stat', 'file', 'wc', 'md5sum', 'sha1sum', 'sha256sum',
  'cksum', 'sum',

  // Searching
  'grep', 'egrep', 'fgrep', 'rg',
  'ag', 'ack', 'ack-grep',
  'find', 'locate', 'updatedb',
  'which', 'whereis', 'type', 'command',
  'ldd', 'strings',

  // System info (read-only)
  'ps', 'top', 'htop', 'btop',
  'pidof', 'pgrep', 'pkill', 'preexec',
  'df', 'du', 'free', 'uptime',
  'uname', 'hostname', 'arch',
  'lsblk', 'blkid', 'lsscsi',
  'ifconfig', 'ip', 'netstat', 'ss',
  'arp', 'route', 'iw', 'iwconfig',
  'nslookup', 'dig', 'host', 'whois',
  'ping', 'ping6', 'traceroute', 'tracepath',
  'mtr', 'nmap',

  // Process info
  'pstree', 'pinfo', 'pmap',
  'lsof', 'fuser', 'strace', 'ltrace',
  'time', 'timeout',

  // Git (read operations)
  'git', 'log', 'git', 'show', 'git', 'diff', 'git', 'status',
  'git', 'branch', 'git', 'tag', 'git', 'remote', 'git', 'stash',
  'git', 'describe', 'git', 'rev-parse', 'git', 'rev-list',
  'git', 'ls-files', 'git', 'ls-tree', 'git', 'cat-file',
  'git', 'show-ref', 'git', 'for-each-ref',

  // Docker (read operations)
  'docker', 'ps', 'docker', 'images', 'docker', 'inspect',
  'docker', 'logs', 'docker', 'port', 'docker', 'network', 'ls',
  'docker', 'volume', 'ls', 'docker', 'stats',

  // Package managers (query operations)
  'apt', 'search', 'apt-cache', 'search',
  'yum', 'list', 'dnf', 'list',
  'pacman', '-Ss', 'pacman', '-Qs',
  'npm', 'search', 'npm', 'view', 'npm', 'list',
  'yarn', 'info', 'yarn', 'list',
  'pip', 'search', 'pip', 'show',
  'cargo', 'search', 'cargo', 'metadata',
  'gem', 'search',

  // Systemd (read operations)
  'systemctl', 'status', 'systemctl', 'show',
  'journalctl', '-b', 'journalctl', '--no-pager',

  // Date/Time
  'date', 'cal', 'tzselect', 'timedatectl',

  // Help/Info
  'man', 'info', 'help', 'which', 'whereis',
  'whatis', 'apropos',

  // Network (read-only)
  'curl', 'wget', 'lynx', 'links',
  'netcat', 'nc', 'telnet', 'ssh', // Note: ssh is technically interactive
]);

/**
 * Commands that are typically read-only but may have write operations
 */
const MOSTLY_READ_COMMANDS = new Set([
  'git', // Many subcommands are read-only
  'docker', // Some subcommands are read-only
  'npm', // Some subcommands are read-only
  'yarn', // Some subcommands are read-only
  'cargo', // Some subcommands are read-only
]);

/**
 * Write commands that modify the filesystem
 */
const WRITE_COMMANDS = new Set([
  // File creation/deletion
  'touch', 'mkdir', 'rmdir',
  'rm', 'del', 'unlink', 'shred',
  'cp', 'mv', 'ln', 'link',
  'install',

  // File content modification
  'cat', 'tee',  // When used with output redirection
  'sed', 'awk', 'perl', 'python', 'ruby', 'php',
  'dd',

  // Permissions
  'chmod', 'chown', 'chgrp', 'chattr', 'lsattr',

  // Archives
  'tar', 'gzip', 'gunzip', 'bzip2', 'bunzip2',
  'xz', 'unxz', 'zip', 'unzip', 'rar', 'unrar',
  '7z', 'p7zip',

  // Package installation
  'apt', 'apt-get', 'aptitude',
  'yum', 'dnf', 'rpm',
  'pacman', 'yaourt', 'yay',
  'npm', 'install', 'npm', 'update', 'npm', 'uninstall',
  'yarn', 'add', 'yarn', 'remove',
  'pnpm', 'add', 'pnpm', 'remove',
  'pip', 'install', 'pip', 'uninstall', 'pip', 'upgrade',
  'cargo', 'install', 'cargo', 'build',
  'gem', 'install', 'gem', 'uninstall',

  // Build tools
  'make', 'cmake', 'ninja',
  'gcc', 'g++', 'clang', 'clang++',
  'javac', 'java', 'gradle', 'mvn',
  'go', 'build', 'go', 'run',

  // Version control (write operations)
  'git', 'add', 'git', 'commit', 'git', 'push', 'git', 'pull',
  'git', 'clone', 'git', 'fetch', 'git', 'merge',
  'git', 'rebase', 'git', 'reset', 'git', 'checkout',
  'git', 'rm', 'git', 'mv', 'git', 'clean',
  'git', 'stash', 'push', 'git', 'stash', 'pop',
  'svn', 'commit', 'svn', 'add', 'svn', 'delete',
  'hg', 'commit', 'hg', 'add', 'hg', 'remove',

  // Docker (write operations)
  'docker', 'run', 'docker', 'build', 'docker', 'commit',
  'docker', 'rm', 'docker', 'rmi', 'docker', 'pull',
  'docker', 'push', 'docker', 'network', 'create',
  'docker', 'volume', 'create', 'docker', 'exec',

  // Process management
  'kill', 'killall', 'pkill', 'nice', 'renice',

  // System control
  'systemctl', 'start', 'systemctl', 'stop', 'systemctl', 'restart',
  'systemctl', 'enable', 'systemctl', 'disable',
  'service', 'start', 'service', 'stop',
  'reboot', 'shutdown', 'halt', 'poweroff', 'init',

  // User management
  'useradd', 'userdel', 'usermod', 'groupadd', 'groupdel',
  'passwd', 'chpasswd',

  // Network
  'iptables', 'ip6tables', 'ufw',
  'hostnamectl', 'timedatectl', 'localectl',

  // Container orchestration
  'kubectl', 'apply', 'kubectl', 'delete', 'kubectl', 'create',
  'kubectl', 'edit', 'kubectl', 'replace',
  'helm', 'install', 'helm', 'uninstall', 'helm', 'upgrade',

  // Infrastructure
  'terraform', 'apply', 'terraform', 'destroy', 'terraform', 'init',
  'ansible-playbook', 'ansible-vault', 'vagrant', 'up',

  // Download/Upload
  'curl', '-o', 'wget', '-O',
  'scp', 'rsync', 'sftp', 'nc',

  // Editor launchers (when they modify files)
  'nano', 'vim', 'vi', 'emacs', 'nano', 'pico',

  // File editors
  'sed', '-i', 'perl', '-i',
]);

/**
 * Destructive commands that permanently modify data
 */
const DESTRUCTIVE_COMMANDS = new Set([
  'rm', 'rmdir', 'shred', 'dd',
  'mkfs', 'mke2fs', 'mke4fs',
  'fdisk', 'parted',
  ':(){:|:&};:', // Fork bomb (pattern, not command)
]);

/**
 * Commands that are always allowed without confirmation
 */
const ALWAYS_ALLOWED = new Set([
  'pwd', 'echo', 'true', 'false', ':',  // No-op commands
  'cd',  // Navigation
  'exit', 'logout', // Exit
  'clear', 'reset', // Terminal
  'alias', 'unalias', // Aliases (session only)
  'export', 'unset', 'local', 'declare', 'readonly', // Shell variables
  'set', 'shopt', // Shell options
  'history', // History (read-only)
]);

/**
 * Git subcommand classifications
 */
const GIT_READ_SUBCOMMANDS = new Set([
  'log', 'show', 'diff', 'status', 'branch', 'tag', 'remote',
  'stash', 'describe', 'rev-parse', 'rev-list', 'ls-files',
  'ls-tree', 'cat-file', 'show-ref', 'for-each-ref',
  'diff-index', 'diff-tree', 'diff-files',
  'name-rev', 'shortlog', 'blame', 'annotate',
  'archive', 'bundle', 'cherry', 'cherry-pick',
  'fetch', 'fetch-pack', 'ls-remote',
]);

const GIT_WRITE_SUBCOMMANDS = new Set([
  'add', 'commit', 'push', 'pull',
  'clone', 'init', 'mv', 'rm',
  'reset', 'revert', 'restore',
  'checkout', 'switch',
  'merge', 'rebase',
  'clean', 'gc', 'prune', 'reflog', 'rerere',
  'stash', 'push', 'stash', 'pop', 'stash', 'drop',
  'push', 'pull', 'fetch', // With --all or specific branches
  'submodule', 'worktree',
]);

// ============================================================================
// Permission Modes
// ============================================================================

/**
 * Default permission modes for command types
 */
export const DEFAULT_PERMISSION_MODES: Record<CommandClassification, PermissionMode> = {
  read: 'bypass',  // Read-only commands are allowed by default
  write: 'ask',     // Write commands require confirmation
  unknown: 'ask',    // Unknown commands require confirmation
};

/**
 * Permission modes for destructive commands
 */
export const DESTRUCTIVE_PERMISSION_MODE: PermissionMode = 'deny';

/**
 * Get permission mode for a command
 */
export function getPermissionMode(
  command: string,
  classification: CommandClassification
): PermissionMode {
  const baseCommand = extractBaseCommand(command);

  // Always allowed commands
  if (ALWAYS_ALLOWED.has(baseCommand.toLowerCase())) {
    return 'bypass';
  }

  // Destructive commands
  if (DESTRUCTIVE_COMMANDS.has(baseCommand.toLowerCase())) {
    return 'deny';
  }

  // Read-only commands
  if (classification === 'read') {
    return 'bypass';
  }

  // Write commands
  if (classification === 'write') {
    return 'ask';
  }

  return 'ask';
}

// ============================================================================
// Classification Functions
// ============================================================================

/**
 * Classify a command as read or write
 */
export function classifyCommand(command: string): CommandClassification {
  const baseCommand = extractBaseCommand(command).toLowerCase();

  // Handle compound commands first (before Set checks, since base names
  // like 'git', 'docker', 'npm' appear in both read and write Sets)
  if (baseCommand === 'git') {
    return classifyGitCommand(command);
  }

  if (baseCommand === 'docker') {
    return classifyDockerCommand(command);
  }

  if (baseCommand === 'npm' || baseCommand === 'yarn' || baseCommand === 'pnpm') {
    return classifyPackageManagerCommand(command);
  }

  if (baseCommand === 'cargo') {
    return classifyCargoCommand(command);
  }

  // Handle pipelines and compound commands
  if (command.includes('|') || command.includes('&&') || command.includes('||')) {
    return classifyCompoundCommand(command);
  }

  // Check direct classification
  if (READ_ONLY_COMMANDS.has(baseCommand)) {
    return 'read';
  }

  if (WRITE_COMMANDS.has(baseCommand)) {
    return 'write';
  }

  // Handle shell built-ins
  return classifyShellBuiltin(command);
}

/**
 * Classify git command
 */
function classifyGitCommand(command: string): CommandClassification {
  // Extract git subcommand
  const parts = command.trim().split(/\s+/);
  const subcommand = parts[1]?.toLowerCase();

  if (!subcommand) {
    return 'read'; // git with no subcommand is typically read-only (git status-like)
  }

  // Remove flags from subcommand
  const cleanSubcommand = subcommand.replace(/^-+/, '');

  if (GIT_READ_SUBCOMMANDS.has(cleanSubcommand)) {
    return 'read';
  }

  if (GIT_WRITE_SUBCOMMANDS.has(cleanSubcommand)) {
    return 'write';
  }

  // Unknown git subcommand - check arguments for destructive flags
  if (command.includes('-D ') || command.includes('--force')) {
    return 'write';
  }

  return 'unknown';
}

/**
 * Classify docker command
 */
function classifyDockerCommand(command: string): CommandClassification {
  const parts = command.trim().split(/\s+/);
  const subcommand = parts[1]?.toLowerCase();

  if (!subcommand) {
    return 'read';
  }

  const readSubcommands = new Set([
    'ps', 'images', 'inspect', 'logs', 'port',
    'network', 'ls', 'volume', 'ls', 'stats',
    'info', 'version', 'events', 'history',
  ]);

  const writeSubcommands = new Set([
    'run', 'build', 'commit', 'rm', 'rmi',
    'pull', 'push', 'network', 'create', 'network', 'rm',
    'volume', 'create', 'volume', 'rm', 'exec',
    'start', 'stop', 'restart', 'kill',
    'tag', 'save', 'load', 'import', 'export',
  ]);

  if (readSubcommands.has(subcommand)) {
    return 'read';
  }

  if (writeSubcommands.has(subcommand)) {
    return 'write';
  }

  return 'unknown';
}

/**
 * Classify npm/yarn/pnpm command
 */
function classifyPackageManagerCommand(command: string): CommandClassification {
  const parts = command.trim().split(/\s+/);
  const subcommand = parts[1]?.toLowerCase();

  if (!subcommand) {
    return 'read';
  }

  const readSubs = new Set([
    'ls', 'list', 'search', 'view', 'info', 'show',
    'why', 'outdated', 'audit', 'pack', 'cache', 'ls',
    'config', 'get', 'root', 'prefix', 'bin', 'repo',
  ]);

  const writeSubs = new Set([
    'install', 'i', 'add', 'remove', 'rm', 'uninstall',
    'update', 'upgrade', 'init', 'create', 'link', 'unlink',
    'publish', 'deprecate', 'dist-tag', 'access', 'org',
    'set', 'login', 'logout', 'token',
  ]);

  if (readSubs.has(subcommand)) {
    return 'read';
  }

  if (writeSubs.has(subcommand)) {
    return 'write';
  }

  return 'unknown';
}

/**
 * Classify cargo command
 */
function classifyCargoCommand(command: string): CommandClassification {
  const parts = command.trim().split(/\s+/);
  const subcommand = parts[1]?.toLowerCase();

  if (!subcommand) {
    return 'read';
  }

  const readSubs = new Set([
    'search', 'metadata', 'tree', 'locate-project',
    'pkgid', 'read-manifest', 'verify-project',
    'version', 'help', 'list',
  ]);

  const writeSubs = new Set([
    'install', 'build', 'b', 'run', 'r', 'test', 't',
    'bench', 'check', 'c', 'clean', 'doc', 'publish',
    'new', 'init', 'add', 'rm', 'remove', 'update', 'upgrade',
    'yank', 'login', 'logout', 'owner', 'vendor',
  ]);

  if (readSubs.has(subcommand)) {
    return 'read';
  }

  if (writeSubs.has(subcommand)) {
    return 'write';
  }

  return 'unknown';
}

/**
 * Classify compound command (with pipes or logical operators)
 */
function classifyCompoundCommand(command: string): CommandClassification {
  // Split by operators
  const parts = command
    .replace(/\|/g, ' | ')
    .replace(/&&/g, ' && ')
    .replace(/\|\|/g, ' || ')
    .replace(/;/g, ' ; ')
    .split(/\s+/)
    .filter(p => p !== '|' && p !== '&&' && p !== '||' && p !== ';');

  let hasWrite = false;
  let hasRead = false;

  for (const part of parts) {
    const classification = classifyCommand(part);
    if (classification === 'write') {
      hasWrite = true;
    } else if (classification === 'read') {
      hasRead = true;
    }
  }

  if (hasWrite) {
    return 'write';
  }

  if (hasRead) {
    return 'read';
  }

  return 'unknown';
}

/**
 * Classify shell built-in command
 */
function classifyShellBuiltin(command: string): CommandClassification {
  const baseCommand = extractBaseCommand(command);

  const readBuiltins = new Set([
    'cd', 'pwd', 'echo', 'printf', 'true', 'false',
    'alias', 'export', 'readonly', 'declare', 'typeset',
    'local', 'return', 'break', 'continue',
    'shift', 'set', 'shopt',
    'wait', 'jobs', 'fg', 'bg',
    'history', 'fc', 'type', 'which', 'whereis',
  ]);

  const writeBuiltins = new Set([
    'eval', 'exec',
    'read', 'readarray', 'mapfile',
    'ulimit', 'umask',
    'enable', 'disown',
    'logout', 'exit',
    'trap',
  ]);

  if (readBuiltins.has(baseCommand)) {
    return 'read';
  }

  if (writeBuiltins.has(baseCommand)) {
    return 'write';
  }

  return 'unknown';
}

/**
 * Check if a command is read-only
 */
export function isReadOnlyCommand(command: string): boolean {
  return classifyCommand(command) === 'read';
}

/**
 * Check if a command is destructive
 */
export function isDestructiveCommand(command: string): boolean {
  const baseCommand = extractBaseCommand(command);
  return DESTRUCTIVE_COMMANDS.has(baseCommand.toLowerCase());
}

/**
 * Get command info
 */
export function getCommandInfo(command: string): CommandInfo {
  const baseCommand = extractBaseCommand(command);
  const classification = classifyCommand(command);
  const mode = getPermissionMode(command, classification);

  return {
    command: baseCommand,
    classification,
    mode,
    requiresApproval: mode === 'ask' || mode === 'deny',
    description: getCommandDescription(baseCommand),
    destructiveWarning: isDestructiveCommand(command)
      ? getDestructiveWarning(command)
      : undefined,
  };
}

/**
 * Get human-readable description of a command
 */
function getCommandDescription(command: string): string {
  const descriptions: Record<string, string> = {
    ls: 'List directory contents',
    cat: 'Display file contents',
    grep: 'Search for patterns in files',
    find: 'Search for files in a directory hierarchy',
    git: 'Version control system',
    npm: 'Node package manager',
    docker: 'Container management',
    mkdir: 'Create directories',
    rm: 'Remove files or directories',
    cp: 'Copy files or directories',
    mv: 'Move or rename files',
    chmod: 'Change file permissions',
    chown: 'Change file owner',
    curl: 'Transfer data from/to a server',
    wget: 'Download files from the web',
    ps: 'Report process status',
    top: 'Display system processes',
    df: 'Report filesystem disk space usage',
    du: 'Estimate file space usage',
  };

  return descriptions[command.toLowerCase()] || `Execute ${command} command`;
}

/**
 * Get destructive warning message
 */
function getDestructiveWarning(command: string): string {
  const baseCommand = extractBaseCommand(command);

  if (baseCommand === 'rm') {
    if (/rm\s+.*-rf/.test(command)) {
      return '⚠️  This will recursively force-delete files without confirmation';
    }
    return '⚠️  This will permanently delete files';
  }

  if (baseCommand === 'dd') {
    return '⚠️  This will perform low-level data copying that cannot be undone';
  }

  if (baseCommand === 'mkfs') {
    return '⚠️  This will create a filesystem, erasing all data on the target';
  }

  if (baseCommand === 'fdisk' || baseCommand === 'parted') {
    return '⚠️  This will modify disk partitions';
  }

  return '⚠️  This operation is destructive and cannot be undone';
}

// ============================================================================
// Module exports
// ============================================================================
