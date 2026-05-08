/**
 * Bash Security Module
 *
 * Validates shell commands for security risks including:
 * - Command injection
 * - Dangerous patterns
 * - Shell metacharacter abuse
 * - Path traversal
 * - Environment variable injection
 *
 * Reference: Loucode's bashSecurity.ts and dangerousPatterns.ts
 */

// ============================================================================
// Types
// ============================================================================

export interface SecurityValidationResult {
  valid: boolean;
  reason?: string;
  warnings: string[];
}

export interface DangerousPattern {
  pattern: RegExp;
  message: string;
  severity: 'error' | 'warning';
}

// ============================================================================
// Dangerous Patterns
// ============================================================================

/**
 * Patterns that indicate potentially dangerous commands
 */
export const DANGEROUS_PATTERNS: DangerousPattern[] = [
  // Fork bomb
  { pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/, message: 'Fork bomb detected', severity: 'error' },

  // Recursive rm
  { pattern: /\brm\s+.*-rf\s+[\/~]/, message: 'Recursive force delete detected', severity: 'error' },

  // dd to raw disk
  { pattern: /\bdd\s+.*of=\/(dev|sd)/, message: 'Direct disk write detected', severity: 'error' },

  // mkfs
  { pattern: /\bmkfs\b/, message: 'Filesystem creation detected', severity: 'error' },

  // Download and execute
  { pattern: /\b(curl|wget)\s+.*\|\s*(bash|sh|python|perl)/i, message: 'Download and execute detected', severity: 'error' },

  // Eval with variable
  { pattern: /\beval\s+\$[a-zA-Z_]/, message: 'Eval with variable detected', severity: 'warning' },

  // Exec with variable
  { pattern: /\bexec\s+\$[a-zA-Z_]/, message: 'Exec with variable detected', severity: 'warning' },

  // Base64 decode and execute
  { pattern: /\bbase64\s+-d\s.*\|\s*(bash|sh|perl|python)/i, message: 'Encoded command execution detected', severity: 'error' },

  // Pipe to shell with variables
  { pattern: /\|.*\bash.*\$\{/, message: 'Pipe to shell with variables', severity: 'warning' },

  // /etc/passwd manipulation
  { pattern: /\b(chmod|chown)\s+.*\/?etc\/?passwd/, message: 'System file modification detected', severity: 'error' },

  // SSH key manipulation
  { pattern: /\b(cat|echo|tee)\s+.*\.ssh\/authorized_keys/, message: 'SSH authorized keys modification', severity: 'error' },

  // Cron manipulation
  { pattern: /\b(cat|echo|tee)\s+.*\/etc\/cron/, message: 'Cron modification detected', severity: 'error' },

  // Sudo without password (if configured)
  { pattern: /\bsudo\s+.*-S\b.*\$/, message: 'Sudo with password from variable', severity: 'warning' },
];

/**
 * Command substitution patterns that could be dangerous
 */
const COMMAND_SUBSTITUTION_PATTERNS: DangerousPattern[] = [
  // Process substitution
  { pattern: /<\(/, message: 'Process substitution <()', severity: 'warning' },
  { pattern: />\(/, message: 'Process substitution >()', severity: 'warning' },

  // Command substitution
  { pattern: /\$\(/, message: '$() command substitution', severity: 'warning' },
  { pattern: /`[^`]+`/, message: 'Backtick command substitution', severity: 'warning' },

  // Parameter expansion
  { pattern: /\$\{[^}]+\}/, message: '${} parameter expansion', severity: 'warning' },

  // Arithmetic expansion
  { pattern: /\$\[\s*[^\]]+\s*\]/, message: '$[] arithmetic expansion', severity: 'warning' },
];

/**
 * Injection patterns
 */
const INJECTION_PATTERNS: DangerousPattern[] = [
  // Newlines in commands
  { pattern: /\n/, message: 'Embedded newline in command', severity: 'error' },

  // Null bytes
  { pattern: /\0/, message: 'Null byte injection', severity: 'error' },

  // Multiple semicolons (command chaining)
  { pattern: /;.{0,5}(rm|del|format|wipe)/i, message: 'Command chaining with destructive operation', severity: 'error' },

  // Control characters
  { pattern: /[\x00-\x08\x0B\x0C\x0E-\x1F]/, message: 'Control character in command', severity: 'error' },

  // Unicode whitespace (zero-width space, etc.)
  { pattern: /[​-‍﻿ ]/, message: 'Unicode whitespace in command', severity: 'error' },

  // Comments after dangerous commands
  { pattern: /\b(rm|del|dd)\s+.*;#/, message: 'Commented destructive command', severity: 'warning' },
  { pattern: /\b(rm|del|dd)\s+.*#/, message: 'Hash comment in command (may be ignored)', severity: 'warning' },
];

/**
 * Environment variable manipulation
 */
const ENV_MANIPULATION_PATTERNS: DangerousPattern[] = [
  // PATH manipulation
  { pattern: /PATH\s*=/, message: 'PATH modification', severity: 'warning' },
  { pattern: /\bexport\s+PATH=/, message: 'PATH export', severity: 'warning' },

  // LD_PRELOAD
  { pattern: /LD_PRELOAD=/, message: 'LD_PRELOAD modification', severity: 'error' },
  { pattern: /\bexport\s+LD_PRELOAD=/, message: 'LD_PRELOAD export', severity: 'error' },

  // PYTHONPATH
  { pattern: /PYTHONPATH\s*=/, message: 'PYTHONPATH modification', severity: 'warning' },

  // NODE_OPTIONS
  { pattern: /NODE_OPTIONS\s*=/, message: 'NODE_OPTIONS modification', severity: 'warning' },

  // HOME override
  { pattern: /HOME\s*=/, message: 'HOME directory override', severity: 'warning' },
];

/**
 * ZSH-specific dangerous patterns
 */
const ZSH_DANGEROUS_PATTERNS: DangerousPattern[] = [
  // Zsh equals expansion
  { pattern: /(?:^|[\s;&|])=[a-zA-Z_]/, message: 'Zsh equals expansion (=cmd)', severity: 'error' },

  // Zsh glob qualifiers with execution
  { pattern: /\(e:/, message: 'Zsh-style glob qualifiers', severity: 'error' },
  { pattern: /\(\+/, message: 'Zsh glob qualifier with command execution', severity: 'error' },

  // Zsh always block
  { pattern: /\}\s*always\s*\{/, message: 'Zsh always block (try/always construct)', severity: 'warning' },
];

/**
 * PowerShell patterns (defense in depth)
 */
const POWERSHELL_PATTERNS: DangerousPattern[] = [
  { pattern: /<#/, message: 'PowerShell comment syntax', severity: 'warning' },
  { pattern: /\|?\s*Invoke-Expression/i, message: 'PowerShell Invoke-Expression (iex)', severity: 'error' },
  { pattern: /\|?\s*Invoke-Command/i, message: 'PowerShell Invoke-Command', severity: 'error' },
  { pattern: /Start-Process\s+-FilePath\s+.*http/, message: 'PowerShell download and execute', severity: 'error' },
];

// ============================================================================
// Dangerous Commands
// ============================================================================

/**
 * Commands that are always dangerous
 */
export const ALWAYS_DANGEROUS_COMMANDS = new Set([
  ':(){:|:&};:', // Fork bomb
  'forkbomb',
]);

/**
 * Commands that are dangerous when used with certain flags
 */
export const CONDITIONALLY_DANGEROUS: Record<string, RegExp[]> = {
  rm: [
    /-rf/,
    /-r\s+.*\//,
    /--no-preserve-root/,
    /--force/,
  ],
  dd: [
    /of=\//,
    /of=\/dev/,
  ],
  chmod: [
    /0000/,
    /7777/,
    /-R\s+777/,
  ],
  chown: [
    /-R\s+root/,
    /--recursive/,
  ],
  mkfs: [
    /mkfs\./,
    /mkfs\s+-t\s+\w+\s+\/dev/,
  ],
  fdisk: [
    /fdisk\s+\/dev/,
  ],
  parted: [
    /parted\s+\/dev/,
    /rm\s+.*\d/,
  ],
  curl: [
    /\|.*\s*(bash|sh|python|perl|ruby)/i,
    /-o\s+\|.*\s*(bash|sh|python|perl|ruby)/i,
  ],
  wget: [
    /\|.*\s*(bash|sh|python|perl|ruby)/i,
    /-O\s+-|.*\|.*\s*(bash|sh|python|perl|ruby)/i,
  ],
  sed: [
    /-i\s+.*\$\(/,
    /-i\s+.*`/,
  ],
  perl: [
    /-e\s+.*system/,
    /-e\s+.*exec/,
  ],
  python: [
    /-c\s+.*import\s+os.*system/,
    /-c\s+.*exec/,
    /-c\s+.*__import__/,
  ],
  node: [
    /-e\s+.*require\(/,
    /-e\s+.*child_process/,
    /--eval\s+.*require\(/,
    /--eval\s+.*child_process/,
  ],
  ruby: [
    /-e\s+.*system/,
    /-e\s+.*eval/,
    /-e\s+.*exec/,
  ],
  php: [
    /-r\s+.*system/,
    /-r\s+.*exec/,
    /-r\s+.*eval/,
  ],
  tar: [
    /--exclude.*\.\.\//,
    /-C\s+\/\.\.\//,
  ],
  zip: [
    /-T\s+.*\.\.\//,
    /-- Vallejo /,
  ],
  unzip: [
    /-o\s+.*\.\.\//,
  ],
};

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Check for dangerous patterns in a command
 */
export function checkDangerousPatterns(command: string): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Extract base command (first word)
  const baseCommand = extractBaseCommand(command);

  // Check always dangerous commands
  if (ALWAYS_DANGEROUS_COMMANDS.has(baseCommand.toLowerCase())) {
    errors.push(`Command '${baseCommand}' is explicitly blocked`);
    return { valid: false, errors, warnings };
  }

  // Check conditionally dangerous
  const dangerousFlags = CONDITIONALLY_DANGEROUS[baseCommand.toLowerCase()];
  if (dangerousFlags) {
    for (const pattern of dangerousFlags) {
      if (pattern.test(command)) {
        warnings.push(`Potentially dangerous use of '${baseCommand}' detected`);
        break;
      }
    }
  }

  // Check dangerous patterns
  for (const dp of DANGEROUS_PATTERNS) {
    if (dp.pattern.test(command)) {
      if (dp.severity === 'error') {
        errors.push(dp.message);
      } else {
        warnings.push(dp.message);
      }
    }
  }

  // Check command substitution
  for (const dp of COMMAND_SUBSTITUTION_PATTERNS) {
    if (dp.pattern.test(command)) {
      warnings.push(dp.message);
    }
  }

  // Check injection patterns
  for (const dp of INJECTION_PATTERNS) {
    if (dp.pattern.test(command)) {
      if (dp.severity === 'error') {
        errors.push(dp.message);
      } else {
        warnings.push(dp.message);
      }
    }
  }

  // Check environment manipulation
  for (const dp of ENV_MANIPULATION_PATTERNS) {
    if (dp.pattern.test(command)) {
      warnings.push(dp.message);
    }
  }

  // Check ZSH patterns
  for (const dp of ZSH_DANGEROUS_PATTERNS) {
    if (dp.pattern.test(command)) {
      warnings.push(dp.message);
    }
  }

  // Check PowerShell patterns
  for (const dp of POWERSHELL_PATTERNS) {
    if (dp.pattern.test(command)) {
      warnings.push(dp.message);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Extract the base command from a shell command
 */
export function extractBaseCommand(command: string): string {
  // Remove leading whitespace and comments
  let trimmed = command.trim();

  // Skip env var assignments (only when = is present)
  trimmed = trimmed.replace(/^[A-Z_][A-Z0-9_]*=[^\s;]*\s*/i, '');

  // Skip leading whitespace again
  trimmed = trimmed.trimStart();

  // Extract first word
  const match = trimmed.match(/^([^\s;|&]+)/);
  return match ? match[1] : trimmed;
}

/**
 * Validate command security
 */
export function validateCommandSecurity(command: string): SecurityValidationResult {
  const warnings: string[] = [];

  // Check dangerous patterns
  const patternResult = checkDangerousPatterns(command);
  warnings.push(...patternResult.warnings);

  if (!patternResult.valid) {
    return {
      valid: false,
      reason: patternResult.errors.join('; '),
      warnings,
    };
  }

  // Check for empty command
  if (!command.trim()) {
    return {
      valid: false,
      reason: 'Empty command',
      warnings: [],
    };
  }

  // Check command length (prevent huge commands)
  if (command.length > 100_000) {
    return {
      valid: false,
      reason: 'Command too long (>100KB)',
      warnings: [],
    };
  }

  // Check for excessive command substitutions
  const substitutionCount = (command.match(/\$\(|`/g) || []).length;
  if (substitutionCount > 20) {
    return {
      valid: false,
      reason: `Too many command substitutions (${substitutionCount})`,
      warnings: [],
    };
  }

  // Check for excessive pipes
  const pipeCount = (command.match(/\|/g) || []).length;
  if (pipeCount > 50) {
    return {
      valid: false,
      reason: `Too many pipes (${pipeCount})`,
      warnings: [],
    };
  }

  // Check for path traversal
  const pathTraversalCount = (command.match(/\.\.\//g) || []).length;
  if (pathTraversalCount > 10) {
    warnings.push(`Excessive path traversal (${pathTraversalCount})`);
  }

  return {
    valid: true,
    warnings,
  };
}

/**
 * Sanitize output to prevent terminal escape sequences
 */
export function sanitizeOutput(output: string): string {
  // Remove ANSI escape sequences
  let sanitized = output.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

  // Remove other escape sequences
  sanitized = sanitized.replace(/\x1B[()][AB012]/g, '');

  // Remove bell characters
  sanitized = sanitized.replace(/\x07/g, '');

  // Remove other control characters except newline and tab
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  return sanitized;
}

/**
 * Check if a command looks like a read-only operation
 */
export function isReadOnlyOperation(command: string): boolean {
  const baseCommand = extractBaseCommand(command).toLowerCase();

  const readOnlyCommands = new Set([
    'ls', 'dir', 'pwd', 'cd', 'echo', 'printf',
    'cat', 'head', 'tail', 'less', 'more', 'view',
    'grep', 'rg', 'ag', 'ack', 'find', 'locate', 'which', 'whereis',
    'stat', 'file', 'wc', 'md5sum', 'sha1sum', 'sha256sum',
    'diff', 'cmp', 'comm', 'sort', 'uniq',
    'ps', 'top', 'htop', 'pidof', 'pgrep', 'pkill',
    'df', 'du', 'free', 'uptime', 'uname', 'hostname',
    'ifconfig', 'ip', 'netstat', 'ss',
    'git', 'svn', 'hg', // These can be read-only
    'curl', 'wget', 'nc', 'telnet', // Network read operations
    'git', 'log', 'git', 'show', 'git', 'diff', 'git', 'status', // git read ops
  ]);

  // Check if base command is read-only
  if (readOnlyCommands.has(baseCommand)) {
    return true;
  }

  // Check for read-only patterns
  const readOnlyPatterns = [
    /\|?\s*grep\s+/i,
    /\|?\s*head\s+/i,
    /\|?\s*tail\s+/i,
    /\|?\s*cat\s+[^\|]/i,
    /\|?\s*wc\s+/i,
    /git\s+(log|show|diff|status|branch|tag|remote)/i,
  ];

  return readOnlyPatterns.some(p => p.test(command));
}

// ============================================================================
// Module exports
// ============================================================================

export const security = {
  validateCommandSecurity,
  checkDangerousPatterns,
  sanitizeOutput,
  isReadOnlyOperation,
  DANGEROUS_PATTERNS,
  ALWAYS_DANGEROUS_COMMANDS,
  CONDITIONALLY_DANGEROUS,
};
