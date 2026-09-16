/**
 * A26 contract: the memory search/embedding path must not open its own network
 * path or read provider keys on its own. Credentials and endpoints come from
 * Pi's provider registry, and the HTTP call goes through the transport the Pi
 * host injects (`@upup/pi-runtime/embedding-provider`).
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = import.meta.dir;

const FILES = ['search.ts', 'embeddings.ts'] as const;

describe('@upup/memory — Pi provider registry contract', () => {
  for (const file of FILES) {
    test(`${file} has no raw fetch and no provider key env reads`, () => {
      const source = readFileSync(join(SRC, file), 'utf8');
      expect(source).not.toMatch(/\bfetch\s*\(/);
      expect(source).not.toMatch(/process\.env\.\w*(API_KEY|TOKEN)/);
    });
  }

  test('embedding requests only go through the injected transport', () => {
    const source = readFileSync(join(SRC, 'embeddings.ts'), 'utf8');
    expect(source).toContain('EmbeddingTransport');
    expect(source).not.toMatch(/https?:\/\/api\.openai\.com[^\n]*fetch/);
  });
});
