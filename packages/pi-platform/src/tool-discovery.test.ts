import { describe, expect, test } from 'bun:test';
import { getPlatformTool, listPlatformTools, searchPlatformTools, type PlatformToolMetadata } from './tool-discovery.js';

const tools: PlatformToolMetadata[] = [
  { name: 'get_financials', description: 'Financial statements', compactDescription: 'Financial data', concurrencySafe: true },
  { name: 'browser', description: 'Web browser automation', compactDescription: 'Browser control', concurrencySafe: false },
  { name: 'read_file', description: 'Read a local file', compactDescription: 'File reading', concurrencySafe: true },
];

describe('platform tool discovery', () => {
  test('searches metadata by query, prefix, and safety', () => {
    expect(searchPlatformTools(tools, { query: 'file' })).toContain('read_file');
    expect(searchPlatformTools(tools, { name: 'get' })).toContain('get_financials');
    expect(searchPlatformTools(tools, { concurrencySafe: false })).toContain('browser');
  });
  test('returns details and suggestions', () => {
    expect(getPlatformTool(tools, 'get_financials')).toContain('Financial statements');
    expect(getPlatformTool(tools, 'financial')).toContain('not found');
  });
  test('lists with prefix and limit', () => {
    expect(listPlatformTools(tools, { prefix: 'get', limit: 1 })).toContain('get_financials');
    expect(listPlatformTools(tools, { limit: 1 })).toContain('and 2 more');
  });
});
