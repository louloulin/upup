/**
 * Behavior tests for ToolSearchTool (requires mocking getToolRegistry)
 */

import { describe, it, expect, vi, beforeEach } from 'bun:test';
import type { RegisteredTool } from './registry.js';

const MOCK_TOOLS: RegisteredTool[] = [
  {
    name: 'get_financials',
    tool: {} as never,
    description: 'Financial statements and metrics for companies',
    compactDescription: 'Financial data retrieval',
    concurrencySafe: true,
  },
  {
    name: 'browser',
    tool: {} as never,
    description: 'Web browser automation and scraping',
    compactDescription: 'Browser control for web scraping',
    concurrencySafe: false,
  },
  {
    name: 'read_file',
    tool: {} as never,
    description: 'Read a local file from the filesystem',
    compactDescription: 'File reading tool',
    concurrencySafe: true,
  },
  {
    name: 'calculate_var',
    tool: {} as never,
    description: 'Value at Risk calculation for portfolio risk',
    compactDescription: 'VaR calculation',
    concurrencySafe: true,
  },
];

// Reset module state between tests
vi.mock('./registry.js', () => ({
  getToolRegistry: vi.fn(() => Promise.resolve(MOCK_TOOLS)),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createToolSearchTool behavior', () => {
  it('should create tool with name tool_search', async () => {
    const { createToolSearchTool } = await import('./tool-search-tool.js');
    const tool = createToolSearchTool();
    expect(tool.name).toBe('tool_search');
  });

  it('should have callable func', async () => {
    const { createToolSearchTool } = await import('./tool-search-tool.js');
    const tool = createToolSearchTool();
    expect(typeof tool.func).toBe('function');
  });

  it('should return matching tools for query', async () => {
    const { createToolSearchTool } = await import('./tool-search-tool.js');
    const tool = createToolSearchTool();
    const result = await tool.func({ query: 'file' });
    expect(result).toContain('read_file');
    expect(result).not.toContain('browser');
  });

  it('should return all tools for empty query', async () => {
    const { createToolSearchTool } = await import('./tool-search-tool.js');
    const tool = createToolSearchTool();
    const result = await tool.func({});
    expect(result).toContain('get_financials');
    expect(result).toContain('browser');
    expect(result).toContain('read_file');
    expect(result).toContain('(of 4 total)');
  });

  it('should filter by name prefix', async () => {
    const { createToolSearchTool } = await import('./tool-search-tool.js');
    const tool = createToolSearchTool();
    const result = await tool.func({ name: 'get' });
    expect(result).toContain('get_financials');
    expect(result).not.toContain('browser');
  });

  it('should filter by concurrencySafe=false', async () => {
    const { createToolSearchTool } = await import('./tool-search-tool.js');
    const tool = createToolSearchTool();
    const result = await tool.func({ concurrencySafe: false });
    expect(result).toContain('browser');
    expect(result).not.toContain('get_financials');
  });

  it('should indicate concurrency safety with emoji', async () => {
    const { createToolSearchTool } = await import('./tool-search-tool.js');
    const tool = createToolSearchTool();
    const result = await tool.func({});
    expect(result).toContain('✅');
    expect(result).toContain('browser'); // has ⚠️
  });

  it('should return no tools found message', async () => {
    const { createToolSearchTool } = await import('./tool-search-tool.js');
    const tool = createToolSearchTool();
    const result = await tool.func({ query: 'xyznonexistent' });
    expect(result).toContain('No tools found');
    expect(result).toContain('4'); // total tools count
  });
});

describe('createToolGetTool behavior', () => {
  it('should create tool with name tool_get', async () => {
    const { createToolGetTool } = await import('./tool-search-tool.js');
    const tool = createToolGetTool();
    expect(tool.name).toBe('tool_get');
  });

  it('should have callable func', async () => {
    const { createToolGetTool } = await import('./tool-search-tool.js');
    const tool = createToolGetTool();
    expect(typeof tool.func).toBe('function');
  });

  it('should return tool details for existing tool', async () => {
    const { createToolGetTool } = await import('./tool-search-tool.js');
    const tool = createToolGetTool();
    const result = await tool.func({ name: 'get_financials' });
    expect(result).toContain('=== Tool: get_financials ===');
    expect(result).toContain('Financial data retrieval');
    expect(result).toContain('--- Full Description ---');
    expect(result).toContain('Financial statements');
  });

  it('should return not found for unknown tool', async () => {
    const { createToolGetTool } = await import('./tool-search-tool.js');
    const tool = createToolGetTool();
    const result = await tool.func({ name: 'nonexistent' });
    expect(result).toContain('not found');
    expect(result).toContain('Run tool_list');
  });

  it('should show concurrency-safe status', async () => {
    const { createToolGetTool } = await import('./tool-search-tool.js');
    const tool = createToolGetTool();
    const result = await tool.func({ name: 'browser' });
    expect(result).toContain('⚠️');
    expect(result).toContain('Not concurrency-safe');
  });

  it('should show concurrency-safe for safe tool', async () => {
    const { createToolGetTool } = await import('./tool-search-tool.js');
    const tool = createToolGetTool();
    const result = await tool.func({ name: 'get_financials' });
    expect(result).toContain('✅');
    expect(result).toContain('Concurrency-safe');
  });
});

describe('createToolListTool behavior', () => {
  it('should create tool with name tool_list', async () => {
    const { createToolListTool } = await import('./tool-search-tool.js');
    const tool = createToolListTool();
    expect(tool.name).toBe('tool_list');
  });

  it('should have callable func', async () => {
    const { createToolListTool } = await import('./tool-search-tool.js');
    const tool = createToolListTool();
    expect(typeof tool.func).toBe('function');
  });

  it('should list all tools', async () => {
    const { createToolListTool } = await import('./tool-search-tool.js');
    const tool = createToolListTool();
    const result = await tool.func({});
    expect(result).toContain('Total: 4 tools');
    expect(result).toContain('get_financials');
    expect(result).toContain('browser');
  });

  it('should filter by prefix', async () => {
    const { createToolListTool } = await import('./tool-search-tool.js');
    const tool = createToolListTool();
    const result = await tool.func({ prefix: 'get' });
    expect(result).toContain("(1 matching 'get')");
    expect(result).toContain('get_financials');
    expect(result).not.toContain('browser');
  });

  it('should limit results', async () => {
    const { createToolListTool } = await import('./tool-search-tool.js');
    const tool = createToolListTool();
    const result = await tool.func({ limit: 2 });
    expect(result).toContain('showing first 2');
    expect(result).not.toContain('showing first 4');
  });

  it('should show concurrency safety emoji', async () => {
    const { createToolListTool } = await import('./tool-search-tool.js');
    const tool = createToolListTool();
    const result = await tool.func({});
    expect(result).toContain('✅');
    expect(result).toContain('⚠️');
  });

  it('should show skipped count when limit is applied to all tools', async () => {
    const { createToolListTool } = await import('./tool-search-tool.js');
    const tool = createToolListTool();
    const result = await tool.func({ limit: 2 });
    expect(result).toContain('... and 2 more');
  });
});
