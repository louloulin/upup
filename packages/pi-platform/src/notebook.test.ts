import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { platformNotebookCreate, platformNotebookDeleteCell, platformNotebookEditCell, platformNotebookInsertCell, platformNotebookRead } from './notebook';

describe('pi-platform notebook', () => {
  test('creates, reads, edits, inserts, and deletes cells inside cwd', async () => {
    const cwd = await mkdtemp('/tmp/upup-platform-notebook-');
    try {
      await platformNotebookCreate({ path: 'analysis.ipynb' }, cwd);
      await platformNotebookInsertCell({ path: 'analysis.ipynb', after_index: -1, cell_type: 'code', source: 'x = 1' }, cwd);
      await platformNotebookEditCell({ path: 'analysis.ipynb', cell_index: 0, new_source: 'x = 2', cell_type: 'code' }, cwd);
      const read = await platformNotebookRead({ path: 'analysis.ipynb' }, cwd);
      expect(read.message).toContain('Cells: 1'); expect(read.message).toContain('x = 2');
      expect(JSON.parse(await readFile(join(cwd, 'analysis.ipynb'), 'utf8')).cells[0].source.join('')).toBe('x = 2');
      expect((await platformNotebookDeleteCell({ path: 'analysis.ipynb', cell_index: 0 }, cwd)).message).toContain('0 cells remaining');
    } finally { await rm(cwd, { recursive: true, force: true }); }
  });

  test('rejects traversal, wrong extension, invalid JSON, and symlink escape', async () => {
    const cwd = await mkdtemp('/tmp/upup-platform-notebook-'); const outside = await mkdtemp('/tmp/upup-platform-notebook-outside-');
    try {
      await expect(platformNotebookCreate({ path: '../escape.ipynb' }, cwd)).rejects.toThrow('escapes');
      await expect(platformNotebookCreate({ path: 'notes.json' }, cwd)).rejects.toThrow('.ipynb');
      await Bun.write(join(cwd, 'bad.ipynb'), '{}');
      await expect(platformNotebookRead({ path: 'bad.ipynb' }, cwd)).rejects.toThrow('invalid');
      await symlink(outside, join(cwd, 'link'));
      await expect(platformNotebookCreate({ path: 'link/escape.ipynb' }, cwd)).rejects.toThrow('escapes');
    } finally { await rm(cwd, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
  });
});
