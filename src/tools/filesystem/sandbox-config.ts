/**
 * Sandbox configuration for UpUp.
 *
 * Supports three modes:
 * - strict: Only allow cwd access
 * - relaxed: Allow cwd + additional dirs (~/.upup, UPUP_DIR)
 * - disabled: No restrictions (dangerous, debug only)
 */

export type SandboxMode = 'strict' | 'relaxed' | 'disabled';

export interface SandboxNetworkConfig {
  allowedDomains?: string[];
  deniedDomains?: string[];
}

export interface SandboxFilesystemConfig {
  allowWrite?: string[];
  denyWrite?: string[];
  allowRead?: string[];
  denyRead?: string[];
}

export interface SandboxConfig {
  /** Sandbox mode: strict/relaxed/disabled */
  mode: SandboxMode;
  /** Whether sandbox is enabled */
  enabled: boolean;
  /** Auto-allow bash commands when sandboxed */
  autoAllowBash: boolean;
  /** Allow commands to run outside sandbox via dangerouslyDisableSandbox */
  allowUnsandboxedCommands: boolean;
  /** Additional directories allowed beyond cwd */
  additionalDirs: string[];
  /** Network restrictions */
  network?: SandboxNetworkConfig;
  /** Filesystem restrictions */
  filesystem?: SandboxFilesystemConfig;
  /** Commands excluded from sandbox */
  excludedCommands?: string[];
}

/** Default sandbox configuration */
export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  mode: 'relaxed',
  enabled: true,
  autoAllowBash: false,
  allowUnsandboxedCommands: true,
  additionalDirs: [
    process.env.HOME ? `${process.env.HOME}/.upup` : '',
    process.env.UPUP_DIR || '',
  ].filter(Boolean),
};

/**
 * Load sandbox configuration from environment variables and defaults.
 * Priority: environment variables > config file > defaults
 */
export function loadSandboxConfig(): SandboxConfig {
  const config: SandboxConfig = { ...DEFAULT_SANDBOX_CONFIG };

  // Read sandbox mode from environment
  const envMode = process.env.UPUP_SANDBOX;
  if (envMode && ['strict', 'relaxed', 'disabled'].includes(envMode)) {
    config.mode = envMode as SandboxMode;
    // Disable sandbox when mode is 'disabled'
    if (envMode === 'disabled') {
      config.enabled = false;
    }
  }

  // Read auto-allow setting
  const envAutoAllow = process.env.UPUP_SANDBOX_AUTO_ALLOW;
  if (envAutoAllow !== undefined) {
    config.autoAllowBash = envAutoAllow === 'true' || envAutoAllow === '1';
  }

  // Read allow unsandboxed commands setting
  const envAllowUnsafe = process.env.UPUP_SANDBOX_ALLOW_UNSAFE;
  if (envAllowUnsafe !== undefined) {
    config.allowUnsandboxedCommands = envAllowUnsafe === 'true' || envAllowUnsafe === '1';
  }

  // Read additional dirs from environment (colon-separated)
  const envAdditionalDirs = process.env.UPUP_SANDBOX_ADDITIONAL_DIRS;
  if (envAdditionalDirs) {
    const dirs = envAdditionalDirs.split(':').filter(Boolean);
    if (dirs.length > 0) {
      config.additionalDirs = [
        ...DEFAULT_SANDBOX_CONFIG.additionalDirs,
        ...dirs,
      ];
    }
  }

  return config;
}

/**
 * Convert sandbox mode to display string.
 */
export function sandboxModeDisplay(mode: SandboxMode): string {
  switch (mode) {
    case 'strict':
      return 'Strict (cwd only)';
    case 'relaxed':
      return 'Relaxed (cwd + ~/.upup)';
    case 'disabled':
      return 'Disabled (no restrictions)';
  }
}