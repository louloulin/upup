/**
 * Write File Tool Tests
 * 
 * Tests atomic write functionality (skip if content unchanged)
 * Uses paths relative to current working directory to pass sandbox checks
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const TEST_DIR = '.dexter-write-test';
const cwd = process.cwd();
const testDirPath = path.join(cwd, TEST_DIR);

function cleanDir(): void {
  if (fs.existsSync(testDirPath)) {
    fs.rmSync(testDirPath, { recursive: true, force: true });
  }
  fs.mkdirSync(testDirPath, { recursive: true });
}

beforeEach(() => cleanDir());
afterEach(() => cleanDir());

describe('write_file atomic write', () => {
  it('should skip write when content is unchanged', async () => {
    const relativePath = `${TEST_DIR}/unchanged.txt`;
    const content = 'Hello, world!';
    
    const { writeFileTool } = await import('./write-file.js');
    
    // First write
    const result1 = await writeFileTool.func({ path: relativePath, content });
    expect(result1).toBeDefined();
    
    // Second write with same content should skip
    const result2 = await writeFileTool.func({ path: relativePath, content });
    const parsed2 = JSON.parse(result2 as string);
    expect(parsed2.data.skipped).toBe(true);
    expect(parsed2.data.bytesWritten).toBe(0);
    expect(parsed2.data.message).toContain('content unchanged');
  });

  it('should write when content changes', async () => {
    const relativePath = `${TEST_DIR}/changed.txt`;
    
    const { writeFileTool } = await import('./write-file.js');
    
    // First write
    await writeFileTool.func({ path: relativePath, content: 'Version 1' });
    
    // Second write with different content
    const result = await writeFileTool.func({ path: relativePath, content: 'Version 2' });
    const parsed = JSON.parse(result as string);
    expect(parsed.data.skipped).toBe(false);
    expect(parsed.data.bytesWritten).toBeGreaterThan(0);
  });

  it('should create new file when it does not exist', async () => {
    const relativePath = `${TEST_DIR}/new.txt`;
    const content = 'Brand new content';
    
    const { writeFileTool } = await import('./write-file.js');
    const result = await writeFileTool.func({ path: relativePath, content });
    const parsed = JSON.parse(result as string);
    
    expect(parsed.data.skipped).toBe(false);
    expect(fs.existsSync(path.join(cwd, relativePath))).toBe(true);
    expect(fs.readFileSync(path.join(cwd, relativePath), 'utf-8')).toBe(content);
  });

  it('should report correct bytes written', async () => {
    const relativePath = `${TEST_DIR}/bytes.txt`;
    const content = '12345';
    
    const { writeFileTool } = await import('./write-file.js');
    const result = await writeFileTool.func({ path: relativePath, content });
    const parsed = JSON.parse(result as string);
    
    expect(parsed.data.bytesWritten).toBe(5);
    expect(parsed.data.message).toContain('5 characters');
  });
});
