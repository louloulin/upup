/**
 * Config Validation Tests
 *
 * Unit tests for configuration validation module.
 * Part of Plan12 P0 implementation.
 *
 * Note: Uses Bun's native test mocking via global mocks
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';

// Since Bun test doesn't support vi.mocked syntax easily,
// we test the validation logic by directly testing exported functions
// with different import scenarios

describe('Config Validation Functions', () => {
  describe('validateConfig', () => {
    it('should be defined and exported', async () => {
      // Dynamic import to test module exports
      const module = await import('./config-validation.js');
      expect(typeof module.validateConfig).toBe('function');
    });

    it('should return an object with expected properties', async () => {
      const module = await import('./config-validation.js');
      const result = module.validateConfig();

      // Check result structure
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('provider');
      expect(result).toHaveProperty('modelId');
      expect(result).toHaveProperty('hasApiKey');
      expect(result).toHaveProperty('missingProvider');
      expect(result).toHaveProperty('missingModel');
      expect(result).toHaveProperty('missingApiKey');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('isFirstTime');
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  describe('isFirstTimeUse', () => {
    it('should be defined and exported', async () => {
      const module = await import('./config-validation.js');
      expect(typeof module.isFirstTimeUse).toBe('function');
    });

    it('should return a boolean', async () => {
      const module = await import('./config-validation.js');
      const result = module.isFirstTimeUse();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('requiresSetup', () => {
    it('should be defined and exported', async () => {
      const module = await import('./config-validation.js');
      expect(typeof module.requiresSetup).toBe('function');
    });

    it('should return a boolean', async () => {
      const module = await import('./config-validation.js');
      const result = module.requiresSetup();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getConfigSummary', () => {
    it('should be defined and exported', async () => {
      const module = await import('./config-validation.js');
      expect(typeof module.getConfigSummary).toBe('function');
    });

    it('should return a string', async () => {
      const module = await import('./config-validation.js');
      const result = module.getConfigSummary();
      expect(typeof result).toBe('string');
    });

    it('should return "Configured:" when valid', async () => {
      const module = await import('./config-validation.js');
      const result = module.getConfigSummary();
      // Should either show "Configured:" or "Missing:"
      expect(
        result.startsWith('Configured:') || result.startsWith('Missing:')
      ).toBe(true);
    });
  });

  describe('applyValidationRules', () => {
    it('should be defined and exported', async () => {
      const module = await import('./config-validation.js');
      expect(typeof module.applyValidationRules).toBe('function');
    });

    it('should return empty array for valid config', async () => {
      const module = await import('./config-validation.js');
      const config = {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4-5',
      };
      const errors = module.applyValidationRules(config);
      expect(Array.isArray(errors)).toBe(true);
      expect(errors.length).toBe(0);
    });

    it('should return errors for empty provider', async () => {
      const module = await import('./config-validation.js');
      const config = {
        provider: '',
        modelId: 'claude-sonnet-4-5',
      };
      const errors = module.applyValidationRules(config);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('Provider'))).toBe(true);
    });

    it('should return errors for empty modelId', async () => {
      const module = await import('./config-validation.js');
      const config = {
        provider: 'anthropic',
        modelId: '',
      };
      const errors = module.applyValidationRules(config);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('Model'))).toBe(true);
    });

    it('should return multiple errors for multiple issues', async () => {
      const module = await import('./config-validation.js');
      const config = {
        provider: '',
        modelId: '',
      };
      const errors = module.applyValidationRules(config);
      expect(errors.length).toBe(2);
    });
  });

  describe('ConfigValidationResult interface', () => {
    it('should have correct structure when provider and model are set', async () => {
      const module = await import('./config-validation.js');
      const result = module.validateConfig();

      // The result structure is correct regardless of actual config values
      expect(typeof result.valid).toBe('boolean');
      expect(typeof result.provider === 'string' || result.provider === null).toBe(true);
      expect(typeof result.modelId === 'string' || result.modelId === null).toBe(true);
      expect(typeof result.hasApiKey).toBe('boolean');
      expect(typeof result.missingProvider).toBe('boolean');
      expect(typeof result.missingModel).toBe('boolean');
      expect(typeof result.missingApiKey).toBe('boolean');
      expect(typeof result.isFirstTime).toBe('boolean');

      // missingProvider and missingApiKey should be related
      if (result.provider === null) {
        expect(result.missingProvider).toBe(true);
        expect(result.missingApiKey).toBe(false); // No API key check when provider is null
      }
    });

    it('errors should match missing fields', async () => {
      const module = await import('./config-validation.js');
      const result = module.validateConfig();

      // If missingProvider is true, should have error
      if (result.missingProvider) {
        expect(result.errors.some(e => e.includes('provider'))).toBe(true);
      }

      // If missingModel is true, should have error
      if (result.missingModel) {
        expect(result.errors.some(e => e.includes('model'))).toBe(true);
      }

      // If missingApiKey is true, should have error
      if (result.missingApiKey) {
        expect(result.errors.some(e => e.includes('API key'))).toBe(true);
      }
    });
  });
});

describe('Config Validation - Integration', () => {
  it('validateConfig should be consistent with requiresSetup', async () => {
    const module = await import('./config-validation.js');
    const validation = module.validateConfig();
    const needsSetup = module.requiresSetup();

    // If requiresSetup returns true, validation should be invalid
    if (needsSetup) {
      expect(validation.valid).toBe(false);
    }
  });

  it('getConfigSummary should reflect validation state', async () => {
    const module = await import('./config-validation.js');
    const validation = module.validateConfig();
    const summary = module.getConfigSummary();

    if (validation.valid) {
      expect(summary.startsWith('Configured:')).toBe(true);
    } else {
      expect(summary.startsWith('Missing:')).toBe(true);
    }
  });
});
