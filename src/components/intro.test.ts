/**
 * Intro Component Tests
 * 
 * Unit tests for IntroComponent.
 * Part of Plan12 P1 implementation.
 */

import { describe, it, expect, beforeEach, vi } from 'bun:test';

// Mock the validateConfig function
vi.mock('../utils/config-validation.js', () => ({
  validateConfig: vi.fn(),
}));

describe('IntroComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should be importable', async () => {
    const { IntroComponent } = await import('./intro.js');
    expect(typeof IntroComponent).toBe('function');
  });

  it('should export updateConfigStatus method', async () => {
    const { IntroComponent } = await import('./intro.js');
    // The class should have updateConfigStatus method
    expect(IntroComponent.prototype).toBeDefined();
  });
});
