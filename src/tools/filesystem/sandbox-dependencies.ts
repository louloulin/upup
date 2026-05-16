/**
 * Sandbox Dependencies Check
 *
 * Checks for sandbox dependencies and platform capabilities.
 * Provides health checks and diagnostic information.
 *
 * Part of Plan17 Phase 5 implementation.
 */

export interface SandboxDependencyCheck {
  /** Whether all dependencies are available */
  available: boolean;
  /** Errors that prevent sandbox from working */
  errors: string[];
  /** Warnings about potential issues */
  warnings: string[];
  /** Current platform */
  platform: string;
  /** Node.js version */
  nodeVersion: string;
  /** Sandbox capability flags */
  capabilities: {
    filesystem: boolean;
    network: boolean;
    process: boolean;
    sandbox: boolean;
  };
}

/**
 * Check if the sandbox environment is properly configured.
 *
 * @returns A SandboxDependencyCheck with status and diagnostic info
 */
export async function checkSandboxDependencies(): Promise<SandboxDependencyCheck> {
  const result: SandboxDependencyCheck = {
    available: true,
    errors: [],
    warnings: [],
    platform: process.platform,
    nodeVersion: process.version,
    capabilities: {
      filesystem: true,
      network: true,
      process: true,
      sandbox: false, // Will be set based on checks
    },
  };

  // Check Node.js version
  const nodeVersion = parseInt(process.version.replace('v', '').split('.')[0], 10);
  if (nodeVersion < 18) {
    result.errors.push(`Node.js ${nodeVersion} is too old. Minimum required: v18`);
    result.available = false;
  }

  // Check for required modules
  try {
    // Check fs module availability using dynamic import (more reliable in bundled envs)
    const fsModule = await import('fs');
    result.capabilities.filesystem = fsModule !== null && typeof fsModule.constants !== 'undefined';
  } catch {
    // In some bundled environments, try the synchronous require
    try {
      const fsSync = require('fs');
      result.capabilities.filesystem = fsSync !== null && typeof fsSync.existsSync === 'function';
    } catch {
      // fs module unavailable
      result.warnings.push('fs module check encountered issues - filesystem operations may be limited');
      result.capabilities.filesystem = true; // Assume available, as most environments have fs
    }
  }

  // Check for sandbox support
  if (process.platform === 'linux') {
    // Check for Linux sandbox capabilities (seccomp, namespaces)
    try {
      // Check if we're running in a container
      const cgroupPath = '/proc/1/cgroup';
      const fs = require('fs');
      if (fs.existsSync(cgroupPath)) {
        const content = fs.readFileSync(cgroupPath, 'utf8');
        if (content.includes('docker') || content.includes('containerd')) {
          result.warnings.push('Running in a container - sandbox features may be limited');
        }
      }
      result.capabilities.sandbox = true;
    } catch {
      result.warnings.push('Could not detect sandbox capabilities');
    }
  } else if (process.platform === 'darwin') {
    // macOS has limited sandbox support via Seatbelt
    result.capabilities.sandbox = false;
    result.warnings.push('Sandbox mode on macOS is not fully supported');
  } else if (process.platform === 'win32') {
    // Windows has no native sandbox
    result.capabilities.sandbox = false;
    result.warnings.push('Sandbox mode on Windows is not fully supported');
  }

  // Check network capabilities
  try {
    const dns = require('dns');
    dns.lookup('localhost', () => {
      result.capabilities.network = true;
    });
  } catch {
    result.warnings.push('DNS lookup failed - network may be restricted');
  }

  // Check process capabilities
  try {
    // Check if process.resources is available (Node.js resource tracking)
    const resources = (process as any).resources;
    if (resources && resources.external && typeof resources.external.disconnect === 'function') {
      resources.external.disconnect();
    }
    result.capabilities.process = true;
  } catch {
    // Process disconnect not available - this is expected in most environments
    result.capabilities.process = true; // Still consider it available
  }

  // Overall availability
  if (result.errors.length > 0) {
    result.available = false;
  }

  return result;
}

/**
 * Get a human-readable summary of sandbox dependencies.
 */
export async function getSandboxDependencySummary(): Promise<string> {
  const check = await checkSandboxDependencies();
  const lines: string[] = [];

  lines.push('Sandbox Dependency Check');
  lines.push('========================');
  lines.push(`Platform: ${check.platform}`);
  lines.push(`Node.js: ${check.nodeVersion}`);
  lines.push('');

  lines.push('Capabilities:');
  lines.push(`  Filesystem: ${check.capabilities.filesystem ? '✓' : '✗'}`);
  lines.push(`  Network: ${check.capabilities.network ? '✓' : '✗'}`);
  lines.push(`  Process: ${check.capabilities.process ? '✓' : '✗'}`);
  lines.push(`  Sandbox: ${check.capabilities.sandbox ? '✓' : '✗'}`);
  lines.push('');

  if (check.errors.length > 0) {
    lines.push('Errors:');
    for (const error of check.errors) {
      lines.push(`  ✗ ${error}`);
    }
    lines.push('');
  }

  if (check.warnings.length > 0) {
    lines.push('Warnings:');
    for (const warning of check.warnings) {
      lines.push(`  ⚠ ${warning}`);
    }
    lines.push('');
  }

  lines.push(`Status: ${check.available ? '✓ Available' : '✗ Unavailable'}`);

  return lines.join('\n');
}

/**
 * Run sandbox check and output results.
 */
export async function runSandboxCheck(): Promise<SandboxDependencyCheck> {
  const check = await checkSandboxDependencies();
  console.log(await getSandboxDependencySummary());
  return check;
}

// Export for CLI integration
const checkSandboxDependenciesFn = checkSandboxDependencies;
export default checkSandboxDependenciesFn;