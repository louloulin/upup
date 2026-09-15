import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportPlatformData } from './export-data';

describe('platform data export', () => {
  test('exports escaped CSV into the requested directory', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'upup-platform-export-'));
    const result = await exportPlatformData({ data: [{ symbol: 'AAPL', note: 'a,b', value: 1 }], filename: '../unsafe name', format: 'csv', outputDirectory });
    expect(result.status).toBe('success');
    const content = await readFile(result.filePath!, 'utf8');
    expect(content).toContain('symbol,note,value');
    expect(content).toContain('AAPL,"a,b",1');
    expect(result.filePath!).toStartWith(outputDirectory);
  });

  test('exports JSON and handles empty input', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'upup-platform-export-'));
    const result = await exportPlatformData({ data: [{ name: 'test', value: 2 }], format: 'json', outputDirectory });
    expect(JSON.parse(await readFile(result.filePath!, 'utf8'))).toEqual([{ name: 'test', value: 2 }]);
    expect(await exportPlatformData({ data: [], outputDirectory })).toEqual({ status: 'empty', format: 'csv', rows: 0, columns: 0, message: 'No data to export' });
  });
});
