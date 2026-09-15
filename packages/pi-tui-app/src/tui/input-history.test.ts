import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InputHistoryController } from './input-history';

describe('InputHistoryController', () => {
  test('navigates newest-first history and previews multiline input', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'upup-input-history-'));
    const previousCwd = process.cwd();
    try {
      process.chdir(directory);
      const controller = new InputHistoryController();
      await controller.init();
      await controller.saveMessage('first');
      await controller.saveMessage('line one\nline two\nline three\nline four');

      expect(controller.getMessages()).toEqual(['line one\nline two\nline three\nline four', 'first']);
      controller.navigateUp();
      expect(controller.historyValue).toBe('line one [+3 lines]');
      controller.navigateUp();
      expect(controller.historyValue).toBe('first');
      controller.navigateDown();
      expect(controller.historyValue).toBe('line one [+3 lines]');
      controller.navigateDown();
      expect(controller.historyValue).toBeNull();
    } finally {
      process.chdir(previousCwd);
      await rm(directory, { recursive: true, force: true });
    }
  });
});
