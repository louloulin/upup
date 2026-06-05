/**
 * Sandbox Command
 *
 * Provides /sandbox command for viewing and configuring sandbox settings.
 * Part of Plan17 Phase 3 implementation.
 */

import { getSandboxManager } from '@upup/tools-registry/filesystem/sandbox-manager';
import type { SandboxMode } from '@upup/tools-registry/filesystem/sandbox-config';

// ANSI colors for output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

function log(message: string, color?: string) {
  console.log(`${color || ''}${message}${colors.reset}`);
}

function success(message: string) {
  log(`✓ ${message}`, colors.green);
}

function info(message: string) {
  log(`  ${message}`, colors.dim);
}

function header(message: string) {
  log(`${colors.bold}${message}${colors.reset}`);
}

/**
 * Format sandbox mode for display
 */
function formatMode(mode: SandboxMode): string {
  switch (mode) {
    case 'strict':
      return 'Strict (cwd only)';
    case 'relaxed':
      return 'Relaxed (cwd + ~/.upup)';
    case 'disabled':
      return 'Disabled (no restrictions)';
    default:
      return mode;
  }
}

/**
 * Get sandbox status as human-readable string
 */
function getStatusText(manager: ReturnType<typeof getSandboxManager>): string {
  const mode = manager.getMode();
  const enabled = manager.isEnabled();
  const autoAllow = manager.isAutoAllowEnabled();

  if (!enabled) {
    return `${colors.red}Disabled${colors.reset}`;
  }

  const parts: string[] = [];
  parts.push(`${colors.green}Enabled${colors.reset}`);
  parts.push(formatMode(mode));

  if (autoAllow) {
    parts.push(`${colors.yellow}auto-allow${colors.reset}`);
  }

  return parts.join(', ');
}

/**
 * Handle /sandbox command execution
 */
export async function executeSandboxCommand(args: string[]): Promise<{ output?: string; error?: string }> {
  const manager = getSandboxManager();
  const subcommand = args[0]?.toLowerCase();

  // No subcommand - show status
  if (!subcommand || subcommand === 'status') {
    header('Sandbox Configuration');
    log('');
    info(`Mode: ${formatMode(manager.getMode())}`);
    info(`Status: ${getStatusText(manager)}`);
    info(`Auto-allow: ${manager.isAutoAllowEnabled() ? 'Yes' : 'No'}`);
    info(`Unsandboxed allowed: ${manager.isUnsandboxedAllowed() ? 'Yes' : 'No'}`);

    const additionalDirs = manager.getAdditionalDirs();
    if (additionalDirs.length > 0) {
      log('');
      header('Additional Directories:');
      for (const dir of additionalDirs) {
        info(`  - ${dir}`);
      }
    }

    log('');
    info('Usage:');
    info('  /sandbox           Show current status');
    info('  /sandbox strict    Set strict mode (cwd only)');
    info('  /sandbox relaxed  Set relaxed mode (cwd + ~/.upup)');
    info('  /sandbox disable  Disable sandbox (dangerous!)');
    info('  /sandbox auto     Enable auto-allow mode');
    info('  /sandbox check    Run dependency check');

    return {};
  }

  // Set mode commands
  switch (subcommand) {
    case 'strict':
      manager.setConfig({ mode: 'strict' });
      success('Sandbox mode set to strict');
      return {};

    case 'relaxed':
      manager.setConfig({ mode: 'relaxed' });
      success('Sandbox mode set to relaxed');
      return {};

    case 'enable':
      manager.setConfig({ enabled: true, mode: 'relaxed' });
      success('Sandbox enabled (relaxed mode)');
      return {};

    case 'disable':
      log('⚠️  WARNING: Disabling sandbox removes all file access restrictions!', colors.yellow);
      log('   This is dangerous and should only be used for debugging.', colors.yellow);
      manager.setConfig({ mode: 'disabled', enabled: false });
      success('Sandbox disabled');
      return {};

    case 'auto':
      manager.setConfig({ mode: 'relaxed', enabled: true, autoAllowBash: true });
      success('Sandbox enabled with auto-allow mode');
      return {};

    case 'check': {
      const check = await manager.runDependencyCheck();
      log('');
      header('Sandbox Dependency Check');
      info(`Platform: ${check.platform}`);
      info(`Node.js: ${check.nodeVersion}`);
      log('');
      info('Capabilities:');
      info(`  Filesystem: ${check.capabilities.filesystem ? '✓' : '✗'}`);
      info(`  Network: ${check.capabilities.network ? '✓' : '✗'}`);
      info(`  Process: ${check.capabilities.process ? '✓' : '✗'}`);
      info(`  Sandbox: ${check.capabilities.sandbox ? '✓' : '✗'}`);

      if (check.errors.length > 0) {
        log('');
        header('Errors:');
        for (const error of check.errors) {
          log(`  ✗ ${error}`, colors.red);
        }
      }

      if (check.warnings.length > 0) {
        log('');
        header('Warnings:');
        for (const warning of check.warnings) {
          log(`  ⚠ ${warning}`, colors.yellow);
        }
      }

      log('');
      success(`Status: ${check.available ? 'Available' : 'Unavailable'}`);
      return {};
    }

    case 'reset':
      manager.reset();
      success('Sandbox configuration reset to defaults');
      return {};

    default:
      return {
        error: `Unknown sandbox command: ${subcommand}\n` +
               `Usage: /sandbox [strict|relaxed|enable|disable|auto|check|reset]`
      };
  }
}

export { getSandboxManager } from '@upup/tools-registry/filesystem/sandbox-manager';
export type { SandboxMode } from '@upup/tools-registry/filesystem/sandbox-config';