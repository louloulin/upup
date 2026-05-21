/**
 * Terminal Capabilities Detection and Configuration
 *
 * Detects and configures terminal capabilities for optimal rendering.
 * Uses pi-tui's detectCapabilities and setCapabilities functions.
 *
 * Capabilities detected:
 * - hyperlinks: OSC 8 hyperlink support
 * - trueColor: 24-bit color support
 * - images: Kitty/iTerm2 image protocol support
 */

import {
  detectCapabilities,
  setCapabilities,
  getCapabilities,
  type TerminalCapabilities,
} from '@mariozechner/pi-tui';
import chalk from 'chalk';

/**
 * Cached capabilities for performance
 */
let cachedCapabilities: TerminalCapabilities | null = null;
let isConfigured = false;

/**
 * Detect and cache terminal capabilities
 */
export async function detectTerminalCapabilities(): Promise<TerminalCapabilities> {
  if (cachedCapabilities) {
    return cachedCapabilities;
  }
  cachedCapabilities = await detectCapabilities();
  return cachedCapabilities;
}

/**
 * Configure terminal with detected capabilities
 */
export async function configureTerminal(): Promise<TerminalCapabilities> {
  if (isConfigured) {
    return cachedCapabilities ?? await detectTerminalCapabilities();
  }

  const caps = await detectTerminalCapabilities();
  setCapabilities(caps);

  isConfigured = true;
  cachedCapabilities = caps;

  return caps;
}

/**
 * Get cached capabilities (synchronous)
 */
export function getCachedCapabilities(): TerminalCapabilities | null {
  return cachedCapabilities;
}

/**
 * Check if terminal supports a specific capability
 */
export async function hasCapability(
  capability: keyof TerminalCapabilities
): Promise<boolean> {
  const caps = await detectTerminalCapabilities();
  const value = caps[capability];
  return typeof value === 'boolean' ? value : false;
}

/**
 * Get terminal info summary for debugging
 */
export function getTerminalInfo(): string {
  const caps = cachedCapabilities;

  if (!caps) {
    return chalk.yellow('Terminal capabilities not yet detected');
  }

  const lines = [
    chalk.bold('Terminal Capabilities:'),
    `  Hyperlinks: ${caps.hyperlinks ? chalk.green('✓') : chalk.red('✗')}`,
    `  True Color: ${caps.trueColor ? chalk.green('✓') : chalk.red('✗')}`,
    `  Images: ${caps.images ? chalk.green('✓') : chalk.red('✗')}`,
  ];

  return lines.join('\n');
}

/**
 * Terminal capability flags for conditional rendering
 */
export interface TerminalFlags {
  supportsHyperlinks: boolean;
  supportsTrueColor: boolean;
  supportsImages: boolean;
}

/**
 * Get all capability flags as boolean object
 */
export async function getTerminalFlags(): Promise<TerminalFlags> {
  const caps = await detectTerminalCapabilities();

  return {
    supportsHyperlinks: caps.hyperlinks,
    supportsTrueColor: caps.trueColor,
    supportsImages: !!caps.images,
  };
}

/**
 * Reset cached capabilities (for testing)
 */
export function resetCapabilitiesCache(): void {
  cachedCapabilities = null;
  isConfigured = false;
}
