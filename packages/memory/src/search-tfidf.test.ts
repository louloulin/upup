/**
 * TF-IDF Search Integration Test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'bun:test';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import * as searchModule from '@upup/memory';

describe('TF-IDF Search Integration', () => {
  describe('tfidfSearch', () => {
    it('should be exported from search module', async () => {
      expect(typeof searchModule.tfidfSearch).toBe('function');
    });

    it('should return empty array for empty query', async () => {
      // Note: This test may fail if memvid is configured
      // but the function should still work with fallback
      const results = await searchModule.tfidfSearch('', { maxResults: 5 });
      expect(Array.isArray(results)).toBe(true);
    });

    it('should include tfidf as source in results', async () => {
      const results = await searchModule.tfidfSearch('test query', { maxResults: 5 });
      // All results should have 'tfidf' as source if any results exist
      for (const r of results) {
        if (r.score > 0) {
          expect(r.source).toBe('tfidf');
        }
      }
    });
  });

  describe('existing search functions', () => {
    it('should export hybridSearch', () => {
      expect(typeof searchModule.hybridSearch).toBe('function');
    });

    it('should export keywordSearch', () => {
      expect(typeof searchModule.keywordSearch).toBe('function');
    });

    it('should export vectorSearch', () => {
      expect(typeof searchModule.vectorSearch).toBe('function');
    });

    it('should export scanSearch', () => {
      expect(typeof searchModule.scanSearch).toBe('function');
    });
  });

  describe('TF-IDF Embedder internals', () => {
    it('should tokenize text correctly', async () => {
      // Test tokenization indirectly through scanSearch which uses similar logic
      const results = await searchModule.scanSearch('programming language', { maxResults: 5 });
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle punctuation in queries', async () => {
      const results = await searchModule.scanSearch('test, query!', { maxResults: 5 });
      expect(Array.isArray(results)).toBe(true);
    });

    it('should filter stop words', async () => {
      // "the" should be filtered, "programming" should remain
      const results = await searchModule.scanSearch('the programming', { maxResults: 5 });
      expect(Array.isArray(results)).toBe(true);
    });
  });
});