/**
 * Terminal Hyperlink Utilities
 *
 * Provides hyperlink support for terminal applications.
 * Uses pi-tui's hyperlink() function with fallback for unsupported terminals.
 *
 * Supported formats:
 * - OSC 8 hyperlinks (most terminals)
 * - iTerm2 image protocol (iTerm2 only)
 */

import { hyperlink, detectCapabilities, type TerminalCapabilities } from '@earendil-works/pi-tui';

/**
 * Check if hyperlinks are supported in the current terminal
 */
export async function checkHyperlinkSupport(): Promise<boolean> {
  const caps = await detectCapabilities();
  return caps.hyperlinks;
}

/**
 * Get current terminal capabilities
 */
export async function getTerminalCapabilities(): Promise<TerminalCapabilities> {
  return detectCapabilities();
}

/**
 * Create a hyperlink with automatic fallback
 *
 * @param text - Display text for the link
 * @param url - URL to link to
 * @param fallback - Fallback text if hyperlinks not supported (default: text)
 * @returns Formatted hyperlink string or fallback
 */
export function createHyperlink(
  text: string,
  url: string,
  fallback?: string
): string {
  try {
    // Use pi-tui's hyperlink function
    return hyperlink(text, url);
  } catch {
    // Fallback to plain text if hyperlink fails
    return fallback ?? text;
  }
}

/**
 * Create a hyperlink with fallback for unsupported terminals
 *
 * @param text - Display text for the link
 * @param url - URL to link to
 * @returns Object containing formatted link and whether it's supported
 */
export async function createHyperlinkWithFallback(
  text: string,
  url: string
): Promise<{ link: string; supported: boolean }> {
  const supported = await checkHyperlinkSupport();
  return {
    link: supported ? createHyperlink(text, url) : text,
    supported,
  };
}

/**
 * Common link formatters for the application
 */
export const linkFormatters = {
  /**
   * Format a documentation link
   */
  docs: (text: string, path?: string) => {
    const baseUrl = 'https://docs.upup.ai';
    const url = path ? `${baseUrl}/${path}` : baseUrl;
    return createHyperlink(text, url, `${text} (${url})`);
  },

  /**
   * Format a GitHub link
   */
  github: (text: string, repo: string, path?: string) => {
    const baseUrl = `https://github.com/${repo}`;
    const url = path ? `${baseUrl}/${path}` : baseUrl;
    return createHyperlink(text, url, `${text} (${url})`);
  },

  /**
   * Format an MCP server documentation link
   */
  mcpDocs: (text: string, serverName: string) => {
    const url = `https://modelcontextprotocol.io/tools/${serverName}`;
    return createHyperlink(text, url, `${text} (${url})`);
  },

  /**
   * Format a feedback/report link
   */
  feedback: (text: string, issueId?: string) => {
    const baseUrl = 'https://github.com/upup-ai/upup/issues';
    const url = issueId ? `${baseUrl}/${issueId}` : baseUrl;
    return createHyperlink(text, url, `${text} (${url})`);
  },
};

/**
 * Format a link with decorative styling
 */
export function formatStyledLink(
  text: string,
  url: string,
  options?: {
    prefix?: string;
    suffix?: string;
    color?: (text: string) => string;
  }
): string {
  const { prefix = '', suffix = '', color } = options ?? {};
  const link = createHyperlink(text, url, `${prefix}${text}${suffix}`);
  return color ? color(link) : link;
}
