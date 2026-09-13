import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { platformMemoryGet, platformMemorySearch, platformMemoryUpdate } from './memory.js';

describe('pi-platform memory', () => {
  test('searches, reads, appends, edits, and deletes bounded memory files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'upup-pi-memory-'));
    await mkdir(root, { recursive: true });
    await writeFile(join(root, 'MEMORY.md'), '# Preferences\nUser prefers conservative position sizing.\n', 'utf8');
    await writeFile(join(root, '2026-09-14.md'), 'Reviewed AAPL allocation.\n', 'utf8');

    const search = await platformMemorySearch({ query: 'conservative sizing' }, root);
    expect(search.results[0]).toMatchObject({ path: 'MEMORY.md', source: 'keyword' });
    expect(search.results[0]?.snippet).toContain('conservative');

    expect(await platformMemoryGet({ path: 'MEMORY.md', from: 2, lines: 1 }, root)).toMatchObject({ text: 'User prefers conservative position sizing.' });
    expect(await platformMemoryUpdate({ content: 'Keep drawdown below 10%.', file: 'long_term' }, root)).toMatchObject({ success: true, file: 'MEMORY.md' });
    expect(await platformMemoryUpdate({ action: 'edit', file: 'MEMORY.md', old_text: '10%', new_text: '8%' }, root)).toMatchObject({ success: true });
    expect(await platformMemoryUpdate({ action: 'delete', file: 'MEMORY.md', old_text: 'Reviewed' }, root)).toMatchObject({ success: false });
    expect(await platformMemoryUpdate({ action: 'edit', file: 'MEMORY.md', old_text: '8%' }, root)).toMatchObject({ success: false });
    expect(await readFile(join(root, 'MEMORY.md'), 'utf8')).toContain('8%');
  });

  test('fails closed for invalid memory paths and malformed updates', async () => {
    const root = await mkdtemp(join(tmpdir(), 'upup-pi-memory-safe-'));
    await expect(platformMemoryGet({ path: '../secret.md' }, root)).rejects.toThrow('escapes');
    await expect(platformMemoryGet({ path: 'notes.txt' }, root)).rejects.toThrow('markdown');
    const outside = await mkdtemp(join(tmpdir(), 'upup-pi-memory-outside-'));
    await writeFile(join(outside, 'secret.md'), 'secret', 'utf8');
    await symlink(join(outside, 'secret.md'), join(root, 'linked.md'));
    await expect(platformMemoryGet({ path: 'linked.md' }, root)).rejects.toThrow('escapes');
    expect(await platformMemoryUpdate({ action: 'append', file: 'long_term' }, root)).toMatchObject({ success: false });
  });
});
