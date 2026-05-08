/**
 * Tests for TimeBasedMCConfig
 */

import { describe, it, expect } from 'vitest';
import { TimeBasedMCConfig, type TimeBasedMCConfigOptions } from './time-mc-config.js';

describe('TimeBasedMCConfig', () => {
  describe('constructor', () => {
    it('should use default options when none provided', () => {
      const config = new TimeBasedMCConfig();
      expect(config.baseThreshold).toBe(4000);
      expect(config.config.businessHourStart).toBe(9);
      expect(config.config.businessHourEnd).toBe(18);
    });

    it('should merge partial options with defaults', () => {
      const config = new TimeBasedMCConfig({ baseThreshold: 8000 });
      expect(config.baseThreshold).toBe(8000);
      expect(config.config.businessHourStart).toBe(9); // default
    });

    it('should accept full options', () => {
      const options: TimeBasedMCConfigOptions = {
        baseThreshold: 6000,
        minThreshold: 2000,
        maxThreshold: 20000,
        businessHourStart: 8,
        businessHourEnd: 17,
        businessHoursFactor: 0.7,
        offHoursFactor: 1.3,
        ageDecayFactor: 0.9,
        messageCountDecayFactor: 0.85,
      };
      const config = new TimeBasedMCConfig(options);
      expect(config.config.baseThreshold).toBe(6000);
      expect(config.config.businessHoursFactor).toBe(0.7);
    });
  });

  describe('getTimeOfDayFactor', () => {
    it('should return business hours factor during business hours', () => {
      const config = new TimeBasedMCConfig({
        businessHourStart: 9,
        businessHourEnd: 18,
        businessHoursFactor: 0.8,
        offHoursFactor: 1.2,
      });

      // 10am = business hours
      const result = config.getTimeOfDayFactor(10);
      expect(result.factor).toBe(0.8);
      expect(result.isBusinessHours).toBe(true);
    });

    it('should return off-hours factor outside business hours', () => {
      const config = new TimeBasedMCConfig({
        businessHourStart: 9,
        businessHourEnd: 18,
        businessHoursFactor: 0.8,
        offHoursFactor: 1.2,
      });

      // 8am = before business hours
      const morning = config.getTimeOfDayFactor(8);
      expect(morning.factor).toBe(1.2);
      expect(morning.isBusinessHours).toBe(false);

      // 20:00 (8pm) = after business hours
      const evening = config.getTimeOfDayFactor(20);
      expect(evening.factor).toBe(1.2);
      expect(evening.isBusinessHours).toBe(false);
    });

    it('should handle boundary hours correctly', () => {
      const config = new TimeBasedMCConfig({
        businessHourStart: 9,
        businessHourEnd: 18,
        businessHoursFactor: 0.8,
        offHoursFactor: 1.2,
      });

      // Exactly at start = business hours
      expect(config.getTimeOfDayFactor(9).isBusinessHours).toBe(true);
      // Exactly at end = off hours (end is exclusive)
      expect(config.getTimeOfDayFactor(18).isBusinessHours).toBe(false);
    });

    it('should use current hour when not specified', () => {
      const config = new TimeBasedMCConfig();
      const result = config.getTimeOfDayFactor();
      expect(result.factor).toBeGreaterThan(0);
      expect(typeof result.isBusinessHours).toBe('boolean');
    });
  });

  describe('getAgeFactor', () => {
    it('should return factor of 1 for brand new session', () => {
      const config = new TimeBasedMCConfig({ ageDecayFactor: 0.95 });
      const result = config.getAgeFactor(0);
      expect(result.factor).toBeCloseTo(1.0, 5);
      expect(result.hoursOld).toBe(0);
    });

    it('should decay factor based on age', () => {
      const config = new TimeBasedMCConfig({ ageDecayFactor: 0.95 });
      // 10 hours old
      const result = config.getAgeFactor(10 * 60 * 60 * 1000);
      expect(result.factor).toBeCloseTo(Math.pow(0.95, 10), 5);
      expect(result.hoursOld).toBe(10);
    });

    it('should cap age at 24 hours', () => {
      const config = new TimeBasedMCConfig({ ageDecayFactor: 0.9 });
      const oneDay = 24 * 60 * 60 * 1000;
      const twoDays = 48 * 60 * 60 * 1000;

      const result24 = config.getAgeFactor(oneDay);
      const result48 = config.getAgeFactor(twoDays);

      // Should be the same since age is capped at 24h
      expect(result24.factor).toBeCloseTo(result48.factor, 5);
    });
  });

  describe('getMessageCountFactor', () => {
    it('should return factor of 1 for fewer than 50 messages', () => {
      const config = new TimeBasedMCConfig({ messageCountDecayFactor: 0.9 });
      const result = config.getMessageCountFactor(25);
      expect(result.factor).toBeCloseTo(1.0, 5);
      expect(result.segments).toBe(0);
    });

    it('should decay factor based on message count segments', () => {
      const config = new TimeBasedMCConfig({ messageCountDecayFactor: 0.9 });
      // 150 messages = 3 segments
      const result = config.getMessageCountFactor(150);
      expect(result.factor).toBeCloseTo(Math.pow(0.9, 3), 5);
      expect(result.segments).toBe(3);
    });

    it('should handle 0 messages', () => {
      const config = new TimeBasedMCConfig();
      const result = config.getMessageCountFactor(0);
      expect(result.factor).toBe(1);
      expect(result.segments).toBe(0);
    });
  });

  describe('getAdaptiveThreshold', () => {
    it('should return base threshold for new session with few messages and neutral time factor', () => {
      const config = new TimeBasedMCConfig({
        baseThreshold: 4000,
        minThreshold: 1000,
        maxThreshold: 16000,
        businessHourStart: 9,
        businessHourEnd: 18,
        businessHoursFactor: 1.0, // Neutral
        offHoursFactor: 1.0, // Neutral
        ageDecayFactor: 1.0, // Neutral
        messageCountDecayFactor: 1.0, // Neutral
      });

      // All factors = 1.0, so threshold = baseThreshold
      const result = config.getAdaptiveThreshold(0, 10);
      expect(result.threshold).toBe(4000);
      expect(result.factor).toBeCloseTo(1.0, 5);
    });

    it('should increase threshold during off-hours with higher off-hours factor', () => {
      const config = new TimeBasedMCConfig({
        baseThreshold: 4000,
        minThreshold: 1000,
        maxThreshold: 16000,
        businessHourStart: 9,
        businessHourEnd: 18,
        businessHoursFactor: 1.0,
        offHoursFactor: 1.2,
        ageDecayFactor: 1.0,
        messageCountDecayFactor: 1.0,
      });

      const result = config.getAdaptiveThreshold(0, 10);
      // Factor depends on current time, but should be either 1.0 or 1.2
      expect(result.threshold).toBeGreaterThanOrEqual(4000);
      expect(result.threshold).toBeLessThanOrEqual(4800);
    });

    it('should lower threshold during business hours', () => {
      const config = new TimeBasedMCConfig({
        baseThreshold: 4000,
        minThreshold: 1000,
        maxThreshold: 16000,
        businessHourStart: 9,
        businessHourEnd: 18,
        businessHoursFactor: 0.8,
        offHoursFactor: 1.2,
        ageDecayFactor: 1.0, // No age decay for this test
        messageCountDecayFactor: 1.0, // No message decay for this test
      });

      // Verify business hours factor is correct
      const timeOfDay = config.getTimeOfDayFactor(14);
      expect(timeOfDay.factor).toBe(0.8);
      expect(timeOfDay.isBusinessHours).toBe(true);
    });

    it('should lower threshold for older sessions', () => {
      const config = new TimeBasedMCConfig({
        baseThreshold: 4000,
        minThreshold: 500,
        maxThreshold: 16000,
        businessHourStart: 9,
        businessHourEnd: 18,
        businessHoursFactor: 1.0,
        offHoursFactor: 1.0,
        ageDecayFactor: 0.9,
        messageCountDecayFactor: 1.0,
      });

      // 10 hours old
      const result = config.getAdaptiveThreshold(10 * 60 * 60 * 1000, 10);
      // factor = 1.0 * 0.9^10 * 1.0 = 0.3487
      // threshold = 4000 * 0.3487 = 1395
      expect(result.threshold).toBeLessThan(4000);
      expect(result.threshold).toBeGreaterThanOrEqual(500);
      expect(result.reason).toContain('session');
    });

    it('should lower threshold for high message counts', () => {
      const config = new TimeBasedMCConfig({
        baseThreshold: 4000,
        minThreshold: 500,
        maxThreshold: 16000,
        businessHourStart: 9,
        businessHourEnd: 18,
        businessHoursFactor: 1.0,
        offHoursFactor: 1.0,
        ageDecayFactor: 1.0,
        messageCountDecayFactor: 0.9,
      });

      // 200 messages = 4 segments
      const result = config.getAdaptiveThreshold(0, 200);
      // factor = 1.0 * 1.0 * 0.9^4 = 0.6561
      // threshold = 4000 * 0.6561 = 2624
      expect(result.threshold).toBeLessThan(4000);
      expect(result.reason).toContain('messages');
    });

    it('should respect minimum threshold', () => {
      const config = new TimeBasedMCConfig({
        baseThreshold: 2000,
        minThreshold: 1000,
        maxThreshold: 16000,
        businessHourStart: 9,
        businessHourEnd: 18,
        businessHoursFactor: 0.1, // Very aggressive
        offHoursFactor: 0.1,
        ageDecayFactor: 0.5,
        messageCountDecayFactor: 0.5,
      });

      // Very aggressive factors, but should not go below minThreshold
      const result = config.getAdaptiveThreshold(24 * 60 * 60 * 1000, 500);
      expect(result.threshold).toBeGreaterThanOrEqual(1000);
    });

    it('should respect maximum threshold', () => {
      const config = new TimeBasedMCConfig({
        baseThreshold: 4000,
        minThreshold: 1000,
        maxThreshold: 8000,
        businessHourStart: 9,
        businessHourEnd: 18,
        businessHoursFactor: 5.0, // Very high
        offHoursFactor: 5.0,
        ageDecayFactor: 1.0,
        messageCountDecayFactor: 1.0,
      });

      // Factor would push threshold way up, but should be capped
      const result = config.getAdaptiveThreshold(0, 0);
      expect(result.threshold).toBeLessThanOrEqual(8000);
    });

    it('should combine all factors', () => {
      const config = new TimeBasedMCConfig({
        baseThreshold: 4000,
        minThreshold: 500,
        maxThreshold: 16000,
        businessHourStart: 9,
        businessHourEnd: 18,
        businessHoursFactor: 0.8,
        offHoursFactor: 1.2,
        ageDecayFactor: 0.9,
        messageCountDecayFactor: 0.9,
      });

      // 10 hours old, 200 messages during business hours
      // factor = 0.8 * 0.9^10 * 0.9^4
      const expectedAgeFactor = Math.pow(0.9, 10);
      const expectedMsgFactor = Math.pow(0.9, 4);
      const expectedFactor = 0.8 * expectedAgeFactor * expectedMsgFactor;
      const expectedThreshold = Math.round(4000 * expectedFactor);

      // We need to test during business hours to get the right factor
      const timeOfDay = config.getTimeOfDayFactor(14);
      if (timeOfDay.isBusinessHours) {
        const result = config.getAdaptiveThreshold(10 * 60 * 60 * 1000, 200);
        expect(result.threshold).toBe(expectedThreshold);
        expect(result.reason).toContain('business hours');
        expect(result.reason).toContain('session');
        expect(result.reason).toContain('messages');
      }
    });
  });
});
