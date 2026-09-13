import { describe, expect, test } from 'bun:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { platformBash, platformEditFile, platformGlob, platformGrep, platformReadFile, platformSendUserFile, platformWriteFile } from './filesystem.js';

describe('pi-platform filesystem', () => {
  test('reads, writes, edits, searches, and copies inside the workspace', async () => {
    const root = join(process.cwd(), '.tmp-pi-platform-filesystem');
    await mkdir(join(root, 'nested'), { recursive: true });
    await writeFile(join(root, 'nested', 'source.ts'), 'const alpha = 1;\nconst beta = 2;\n');
    const oldCwd = process.cwd();
    process.chdir(root);
    try {
      expect(await platformReadFile({ path: 'nested/source.ts' })).toMatchObject({ totalLines: 3, content: expect.stringContaining('alpha') });
      expect(await platformWriteFile({ path: 'nested/output.txt', content: 'hello', confirm: true })).toMatchObject({ bytesWritten: 5 });
      expect(await platformEditFile({ path: 'nested/output.txt', old_text: 'hello', new_text: 'world', confirm: true })).toMatchObject({ replacements: 1 });
      expect(await platformGlob({ pattern: '**/*.ts' })).toMatchObject({ filenames: ['nested/source.ts'] });
      expect(await platformGrep({ pattern: 'alpha', path: 'nested', output_mode: 'content', '-C': 1 })).toMatchObject({ content: expect.stringContaining('alpha') });
      expect(await platformGrep({ pattern: 'alpha', path: 'nested', output_mode: 'content', '-C': 1 })).toMatchObject({ content: expect.stringContaining('beta') });
      expect(await platformSendUserFile({ path: 'nested/output.txt', destination: 'copied.txt', confirm: true })).toMatchObject({ message: expect.stringContaining('copied.txt') });
      expect(await readFile(join(root, 'copied.txt'), 'utf8')).toBe('world');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('fails closed for traversal, ambiguous edits, and dangerous shell commands', async () => {
    await expect(platformReadFile({ path: '../package.json' })).rejects.toThrow('escapes');
    const oldCwd = process.cwd();
    const root = join(oldCwd, '.tmp-pi-platform-filesystem-ambiguous');
    await mkdir(root, { recursive: true });
    await writeFile(join(root, 'file.txt'), 'same same');
    process.chdir(root);
    try {
      await expect(platformEditFile({ path: 'file.txt', old_text: 'same', new_text: 'new', confirm: true })).rejects.toThrow('occurs');
      await expect(platformEditFile({ path: 'file.txt', old_text: 'same', new_text: 'new' })).rejects.toThrow('confirmation');
      await expect(platformBash({ command: 'rm -rf .' })).rejects.toThrow('rejected');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('preserves shell exit status, bounded output, and environment injection', async () => {
    const output = await platformBash({ command: 'printf "$UPUP_TEST_VALUE"; exit 7', env: { UPUP_TEST_VALUE: 'platform-shell' } });
    expect(output.exitCode).toBe(7);
    expect(output.stdout).toBe('platform-shell');

    const truncated = await platformBash({ command: `printf '${'1'.repeat(1_100)}'`, maxOutputLength: 1_000 });
    expect(truncated.truncated).toBe(true);
    expect(truncated.stdout).toContain('[Output truncated]');
  });
});
