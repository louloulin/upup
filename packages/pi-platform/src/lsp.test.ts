import { describe, expect, test } from 'bun:test';
import { formatPlatformLspCompletions, formatPlatformLspDefinitions, formatPlatformLspDiagnostics, formatPlatformLspHover, formatPlatformLspReferences, getPlatformLspClient, resetPlatformLspClient, setPlatformLspClient } from './lsp.js';

describe('Pi platform LSP', () => {
  test('formats all code intelligence results deterministically', async () => {
    setPlatformLspClient({
      complete: async () => [{ label: 'hello', kind: 'function', detail: '() => void' }],
      definition: async () => [{ uri: 'file:///src/a.ts', range: { startLine: 2, startColumn: 1, endLine: 2, endColumn: 4 } }],
      references: async () => [{ uri: 'file:///src/b.ts', line: 4, column: 5, text: 'hello()' }],
      hover: async () => ({ contents: 'function hello()', range: { startLine: 2, endLine: 2 } }),
      diagnostics: async () => [{ severity: 'error', message: 'bad', line: 1, column: 0, code: 'E1' }],
    });
    const client = getPlatformLspClient();
    expect(formatPlatformLspCompletions(await client.complete('x', 0, 0))).toContain('hello [function]');
    expect(formatPlatformLspDefinitions(await client.definition('x', 0, 0))).toContain('a.ts:3:2');
    expect(formatPlatformLspReferences(await client.references('x', 0, 0))).toContain('b.ts:5:6');
    expect(formatPlatformLspHover(await client.hover('x', 0, 0))).toContain('lines 3-3');
    expect(formatPlatformLspDiagnostics(await client.diagnostics('x'))).toContain('[ERROR] line 2:1 (E1): bad');
    resetPlatformLspClient();
    expect(formatPlatformLspCompletions(await getPlatformLspClient().complete('x', 0, 0))).toContain('No completions');
  });
});
