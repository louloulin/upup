/**
 * Crypto Utilities
 *
 * Simple hashing utilities for file identification.
 */

import * as fs from 'fs';
import * as crypto from 'crypto';

/**
 * Hash a file using its content
 */
export function hashFile(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    return '';
  }

  const content = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Simple string hash
 */
export function hashString(str: string): string {
  return crypto.createHash('md5').update(str).digest('hex');
}

/**
 * Generate random ID
 */
export function generateId(): string {
  return crypto.randomBytes(16).toString('hex');
}