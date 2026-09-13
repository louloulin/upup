import { describe, expect, test } from 'bun:test';
import { assertSafeBrowserUrl } from './src/index.js';

describe('Pi browser core', () => {
  test('allows public HTTP(S) URL syntax and rejects local targets', async () => {
    await expect(assertSafeBrowserUrl('file:///tmp/a')).rejects.toThrow('HTTP and HTTPS');
    await expect(assertSafeBrowserUrl('http://localhost:18081')).rejects.toThrow('private or local');
  });
});
