/**
 * Tests for Memory Audit Logger
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import {
  MemoryAuditLogger,
  getAuditLogger,
  resetAuditLogger,
  type MemoryAuditEntry,
} from '@upup/memory';

describe('MemoryAuditLogger', () => {
  const testPath = '/tmp/test-memory-audit.log';
  let logger: MemoryAuditLogger;

  beforeEach(() => {
    // Clean up any existing test file
    if (existsSync(testPath)) {
      unlinkSync(testPath);
    }
    logger = new MemoryAuditLogger(testPath);
    resetAuditLogger(); // Reset global instance
  });

  afterEach(() => {
    if (existsSync(testPath)) {
      unlinkSync(testPath);
    }
  });

  describe('logRead', () => {
    it('writes read operation to audit log', () => {
      logger.logRead('user', 5, 'session-123', 'memory_search');

      const entries = logger.readAuditLog();
      expect(entries).toHaveLength(1);
      expect(entries[0].operation).toBe('read');
      expect(entries[0].category).toBe('user');
      expect(entries[0].resultCount).toBe(5);
      expect(entries[0].sessionId).toBe('session-123');
      expect(entries[0].toolName).toBe('memory_search');
      expect(entries[0].timestamp).toBeTruthy();
    });
  });

  describe('logSearch', () => {
    it('writes search operation with query to audit log', () => {
      logger.logSearch('investment strategy', 10, 'session-456', 'memory_search');

      const entries = logger.readAuditLog();
      expect(entries).toHaveLength(1);
      expect(entries[0].operation).toBe('search');
      expect(entries[0].query).toBe('investment strategy');
      expect(entries[0].resultCount).toBe(10);
    });
  });

  describe('logWrite', () => {
    it('writes write operation to audit log', () => {
      logger.logWrite('project', 'session-789', 'memory_update');

      const entries = logger.readAuditLog();
      expect(entries).toHaveLength(1);
      expect(entries[0].operation).toBe('write');
    });
  });

  describe('logUpdate', () => {
    it('writes update operation to audit log', () => {
      logger.logUpdate('feedback', 'session-111', 'memory_update');

      const entries = logger.readAuditLog();
      expect(entries).toHaveLength(1);
      expect(entries[0].operation).toBe('update');
    });
  });

  describe('logDelete', () => {
    it('writes delete operation to audit log', () => {
      logger.logDelete('reference', 'session-222', 'memory_update');

      const entries = logger.readAuditLog();
      expect(entries).toHaveLength(1);
      expect(entries[0].operation).toBe('delete');
    });
  });

  describe('readAuditLog', () => {
    it('returns empty array when no log file exists', () => {
      const entries = logger.readAuditLog();
      expect(entries).toEqual([]);
    });

    it('returns all entries when no limit specified', () => {
      logger.logRead();
      logger.logRead();
      logger.logRead();

      const entries = logger.readAuditLog();
      expect(entries).toHaveLength(3);
    });

    it('respects limit parameter', () => {
      logger.logRead();
      logger.logRead();
      logger.logRead();

      const entries = logger.readAuditLog(2);
      expect(entries).toHaveLength(2);
    });

    it('returns entries in chronological order', () => {
      logger.logRead('category1');
      logger.logRead('category2');
      logger.logRead('category3');

      const entries = logger.readAuditLog();
      expect(entries[0].category).toBe('category1');
      expect(entries[1].category).toBe('category2');
      expect(entries[2].category).toBe('category3');
    });
  });

  describe('getStats', () => {
    it('returns correct statistics', () => {
      logger.logRead();
      logger.logRead();
      logger.logSearch();
      logger.logWrite();
      logger.logUpdate();

      const stats = logger.getStats();
      expect(stats.totalOperations).toBe(5);
      expect(stats.byOperation.read).toBe(2);
      expect(stats.byOperation.search).toBe(1);
      expect(stats.byOperation.write).toBe(1);
      expect(stats.byOperation.update).toBe(1);
    });

    it('returns empty stats when no operations logged', () => {
      const stats = logger.getStats();
      expect(stats.totalOperations).toBe(0);
      expect(stats.byOperation).toEqual({});
    });
  });

  describe('getAuditLogger (singleton)', () => {
    it('returns same instance on multiple calls', () => {
      const logger1 = getAuditLogger();
      const logger2 = getAuditLogger();
      expect(logger1).toBe(logger2);
    });

    it('returns different instance after reset', () => {
      const logger1 = getAuditLogger();
      resetAuditLogger();
      const logger2 = getAuditLogger();
      expect(logger1).not.toBe(logger2);
    });
  });
});
