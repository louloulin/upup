import { describe, expect, it } from 'bun:test';
import { isPiWebAccessAvailable, searchWebViaPiWebAccess } from './web-access-bridge';

function fakeImporter(result: unknown) {
  return async () => result;
}

describe('searchWebViaPiWebAccess', () => {
  it('normalises a pi-web-access search response into the UpUp shape', async () => {
    const value = await searchWebViaPiWebAccess('600519 估值', undefined, {
      importer: fakeImporter({
        search: async () => ({
          answer: '贵州茅台估值处于历史中位。',
          results: [
            { title: '茅台 2025 中报', url: 'https://example.com/a', content: '净利润增长', publishedDate: '2026-08-01' },
            { title: '行业对比', url: 'https://example.com/b', content: 'PE 28x' },
          ],
          citations: ['https://example.com/a'],
        }),
      }),
    });
    expect(value).toBeDefined();
    expect(value?.provider).toBe('pi-web-access');
    expect(value?.query).toBe('600519 估值');
    expect(value?.answer).toContain('贵州茅台');
    expect(value?.results).toHaveLength(2);
    expect(value?.results[0]?.title).toBe('茅台 2025 中报');
    expect(value?.sourceUrls).toContain('https://example.com/a');
    expect(value?.sourceUrls).toContain('https://example.com/b');
  });

  it('drops results with non-http URLs', async () => {
    const value = await searchWebViaPiWebAccess('q', undefined, {
      importer: fakeImporter({
        search: async () => ({
          results: [
            { url: 'ftp://bad' },
            { url: 'https://good.example/x', content: 'ok' },
          ],
        }),
      }),
    });
    expect(value?.results).toHaveLength(1);
    expect(value?.results[0]?.url).toBe('https://good.example/x');
  });

  it('returns undefined when the module import fails', async () => {
    const errors: unknown[] = [];
    const value = await searchWebViaPiWebAccess('q', undefined, {
      importer: async () => { throw new Error('module not found'); },
      onError: (_where, error) => errors.push(error),
    });
    expect(value).toBeUndefined();
    expect(errors.length).toBe(1);
  });

  it('returns undefined when the module lacks a search export', async () => {
    const value = await searchWebViaPiWebAccess('q', undefined, {
      importer: fakeImporter({ notSearch: true }),
    });
    expect(value).toBeUndefined();
  });

  it('isolates provider failures and returns undefined', async () => {
    const errors: unknown[] = [];
    const value = await searchWebViaPiWebAccess('q', undefined, {
      importer: fakeImporter({ search: async () => { throw new Error('provider exploded'); } }),
      onError: (_where, error) => errors.push(error),
    });
    expect(value).toBeUndefined();
    expect(errors.length).toBe(1);
  });

  it('forwards provider + numResults to pi-web-access', async () => {
    let sawOptions: Record<string, unknown> | undefined;
    await searchWebViaPiWebAccess('q', undefined, {
      provider: 'tavily',
      numResults: 12,
      importer: fakeImporter({
        search: async (_query: string, options: Record<string, unknown>) => {
          sawOptions = options;
          return { results: [] };
        },
      }),
    });
    expect(sawOptions?.provider).toBe('tavily');
    expect(sawOptions?.numResults).toBe(12);
  });
});

describe('isPiWebAccessAvailable', () => {
  it('is true when the injected importer returns a search fn', async () => {
    expect(await isPiWebAccessAvailable(fakeImporter({ search: async () => ({ results: [] }) }))).toBe(true);
  });

  it('is false when the injected importer returns nothing useful', async () => {
    expect(await isPiWebAccessAvailable(fakeImporter({}))).toBe(false);
  });
});
