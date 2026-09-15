/**
 * Doctor Command Tests
 *
 * Unit tests for health check command.
 * Part of Plan12 P2 implementation.
 */

import { describe, it, expect } from 'bun:test';

describe('Doctor Command', () => {
  it('should export runDoctor function', async () => {
    const module = await import('./doctor');
    expect(typeof module.runDoctor).toBe('function');
  });

  it('should be an async function', async () => {
    const module = await import('./doctor');
    expect(module.runDoctor.constructor.name).toBe('AsyncFunction');
  });
});
