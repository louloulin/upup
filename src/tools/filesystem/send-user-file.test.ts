/**
 * Send User File Tool Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const TEST_DIR = '.dexter-send-test';
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

describe('send_user_file', () => {
  it('should send file to Downloads by default', async () => {
    const { sendUserFileTool } = await import('./send-user-file.js');
    
    // Create source file
    const sourcePath = path.join(testDirPath, 'report.txt');
    const content = 'Investment Report Content';
    fs.writeFileSync(sourcePath, content);
    
    // Send file
    const result = await sendUserFileTool.func({ path: `${TEST_DIR}/report.txt` });
    const parsed = JSON.parse(result as string);
    
    expect(parsed.data.success).toBe(true);
    expect(parsed.data.size).toBe(Buffer.byteLength(content, 'utf-8'));
    expect(parsed.data.destination).toContain('Downloads');
  });

  it('should send file to custom destination', async () => {
    const { sendUserFileTool } = await import('./send-user-file.js');
    
    // Create source file
    const sourcePath = path.join(testDirPath, 'analysis.txt');
    fs.writeFileSync(sourcePath, 'Analysis data');
    
    const destPath = `${TEST_DIR}/sent_analysis.txt`;
    
    // Send file
    const result = await sendUserFileTool.func({ 
      path: `${TEST_DIR}/analysis.txt`,
      destination: destPath,
    });
    const parsed = JSON.parse(result as string);
    
    expect(parsed.data.success).toBe(true);
    expect(fs.existsSync(path.join(cwd, destPath))).toBe(true);
  });

  it('should return error for non-existent file', async () => {
    const { sendUserFileTool } = await import('./send-user-file.js');
    
    const result = await sendUserFileTool.func({ path: `${TEST_DIR}/nonexistent.txt` });
    const parsed = JSON.parse(result as string);
    
    expect(parsed.data.success).toBe(false);
    expect(parsed.data.error).toContain('not found');
  });
});
