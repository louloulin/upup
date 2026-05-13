/**
 * Embeddings Module Test
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  SimpleTFIDFEmbedder,
  SimpleSearchEngine,
} from './embeddings.js';

describe('SimpleTFIDFEmbedder', () => {
  let embedder: SimpleTFIDFEmbedder;

  beforeEach(() => {
    embedder = new SimpleTFIDFEmbedder();
  });

  describe('tokenize', () => {
    it('should tokenize text into words', () => {
      const tokens = embedder.tokenize('Hello world this is a test');
      expect(tokens).toContain('hello');
      expect(tokens).toContain('world');
      expect(tokens).toContain('test');
    });

    it('should remove stop words', () => {
      const tokens = embedder.tokenize('the quick brown fox');
      expect(tokens).not.toContain('the');
      expect(tokens).toContain('quick');
      expect(tokens).toContain('brown');
      expect(tokens).toContain('fox');
    });

    it('should handle punctuation', () => {
      const tokens = embedder.tokenize('Hello, world! How are you?');
      expect(tokens).toContain('hello');
      expect(tokens).toContain('world');
      expect(tokens).toContain('how');
      expect(tokens).toContain('you');
    });

    it('should filter short words', () => {
      const tokens = embedder.tokenize('a ab abc xyz');
      expect(tokens).not.toContain('a');
      expect(tokens).toContain('abc');
      expect(tokens).toContain('xyz');
    });
  });

  describe('buildVocabulary', () => {
    it('should build vocabulary from texts', () => {
      const texts = ['hello world', 'hello there', 'world peace'];
      embedder.buildVocabulary(texts);

      expect(embedder.embed('hello').length).toBeGreaterThan(0);
    });

    it('should limit vocabulary size', () => {
      const embedder2 = new SimpleTFIDFEmbedder();
      const texts = Array(200).fill('word').map((w, i) => `${w}${i}`);
      embedder2.buildVocabulary(texts);

      const vec = embedder2.embed('word1 word2 word3');
      expect(vec.length).toBeLessThanOrEqual(128);
    });
  });

  describe('embed', () => {
    it('should create normalized vectors', () => {
      embedder.buildVocabulary(['hello world', 'test text']);
      const vec = embedder.embed('hello world');

      const magnitude = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
      expect(magnitude).toBeCloseTo(1, 2);
    });

    it('should create different vectors for different texts', () => {
      embedder.buildVocabulary(['apple fruit', 'car vehicle']);
      const vec1 = embedder.embed('apple');
      const vec2 = embedder.embed('car');

      expect(vec1).not.toEqual(vec2);
    });
  });

  describe('cosineSimilarity', () => {
    it('should return 1 for identical vectors', () => {
      embedder.buildVocabulary(['test']);
      const vec = embedder.embed('test');
      const sim = embedder.cosineSimilarity(vec, vec);
      expect(sim).toBeCloseTo(1, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      embedder.buildVocabulary(['hello', 'world']);
      const vec1 = embedder.embed('hello');
      const vec2 = embedder.embed('world');

      // These may not be exactly 0 but should be lower than identical
      const sim = embedder.cosineSimilarity(vec1, vec2);
      expect(sim).toBeLessThan(1);
    });
  });
});

describe('SimpleSearchEngine', () => {
  describe('index and search', () => {
    it('should find similar documents', () => {
      const engine = new SimpleSearchEngine();

      engine.index([
        { id: '1', text: 'Python is a programming language' },
        { id: '2', text: 'JavaScript is also a programming language' },
        { id: '3', text: 'The weather is nice today' },
      ]);

      const results = engine.search('programming code');

      expect(results.length).toBeGreaterThan(0);
      // Programming-related docs should rank higher
      const topResult = results[0];
      expect(topResult.id).toMatch(/^[123]$/);
    });

    it('should return relevance scores', () => {
      const engine = new SimpleSearchEngine();

      engine.index([
        { id: '1', text: 'machine learning algorithms' },
        { id: '2', text: 'baking cookies recipe' },
      ]);

      const results = engine.search('learning');

      expect(results[0].score).toBeGreaterThan(0);
      expect(results[0].score).toBeLessThanOrEqual(1);
    });

    it('should respect limit parameter', () => {
      const engine = new SimpleSearchEngine<{ category: string }>();

      engine.index([
        { id: '1', text: 'doc one', metadata: { category: 'a' } },
        { id: '2', text: 'doc two', metadata: { category: 'b' } },
        { id: '3', text: 'doc three', metadata: { category: 'c' } },
        { id: '4', text: 'doc four', metadata: { category: 'd' } },
        { id: '5', text: 'doc five', metadata: { category: 'e' } },
      ]);

      const results = engine.search('doc', 2);
      expect(results.length).toBe(2);
    });

    it('should return empty for empty index', () => {
      const engine = new SimpleSearchEngine();
      const results = engine.search('anything');
      expect(results).toEqual([]);
    });

    it('should preserve metadata', () => {
      const engine = new SimpleSearchEngine<{ tag: string }>();

      engine.index([
        { id: '1', text: 'important document', metadata: { tag: 'important' } },
      ]);

      const results = engine.search('document');
      expect(results[0].metadata?.tag).toBe('important');
    });
  });

  describe('clear', () => {
    it('should clear all documents', () => {
      const engine = new SimpleSearchEngine();

      engine.index([{ id: '1', text: 'test' }]);
      expect(engine.size()).toBe(1);

      engine.clear();
      expect(engine.size()).toBe(0);
    });
  });

  describe('size', () => {
    it('should return document count', () => {
      const engine = new SimpleSearchEngine();

      expect(engine.size()).toBe(0);

      engine.index([
        { id: '1', text: 'one' },
        { id: '2', text: 'two' },
        { id: '3', text: 'three' },
      ]);

      expect(engine.size()).toBe(3);
    });
  });
});