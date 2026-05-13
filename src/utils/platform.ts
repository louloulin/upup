/**
 * Platform Utilities
 *
 * Cross-platform detection and utilities.
 */

export type Platform = 'macos' | 'linux' | 'windows';

export const SUPPORTED_PLATFORMS: Platform[] = ['macos', 'linux', 'windows'];

/**
 * Get current platform
 */
export function getPlatform(): Platform {
  const platform = process.platform;

  if (platform === 'darwin') {
    return 'macos';
  }

  if (platform === 'win32') {
    return 'windows';
  }

  return 'linux';
}

/**
 * Check if running on macOS
 */
export function isMacOS(): boolean {
  return getPlatform() === 'macos';
}

/**
 * Check if running on Windows
 */
export function isWindows(): boolean {
  return getPlatform() === 'windows';
}

/**
 * Check if running on Linux
 */
export function isLinux(): boolean {
  return getPlatform() === 'linux';
}

/**
 * Check if running in WSL (Windows Subsystem for Linux)
 */
export function isWSL(): boolean {
  if (process.platform !== 'linux') {
    return false;
  }

  try {
    const osRelease = require('os').release();
    if (osRelease.toLowerCase().includes('microsoft')) {
      return true;
    }
  } catch {}

  // Alternative check: look for WSL-specific file
  try {
    require('fs').statSync('/proc/version');
    const content = require('fs').readFileSync('/proc/version', 'utf8').toLowerCase();
    if (content.includes('microsoft') || content.includes('wsl')) {
      return true;
    }
  } catch {}

  return false;
}