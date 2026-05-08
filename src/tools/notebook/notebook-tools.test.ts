/**
 * Tests for NotebookTools
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  NotebookReadSchema,
  NotebookCreateSchema,
  NotebookEditCellSchema,
  NotebookInsertCellSchema,
  NotebookDeleteCellSchema,
  NOTEBOOK_READ_DESCRIPTION,
  NOTEBOOK_CREATE_DESCRIPTION,
  NOTEBOOK_EDIT_CELL_DESCRIPTION,
  NOTEBOOK_INSERT_CELL_DESCRIPTION,
  NOTEBOOK_DELETE_CELL_DESCRIPTION,
  createNotebookReadTool,
  createNotebookCreateTool,
  createNotebookEditCellTool,
  createNotebookInsertCellTool,
  createNotebookDeleteCellTool,
} from './notebook-tools.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'notebook-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true }).catch(() => {});
});

// ============================================================================
// Schema Tests
// ============================================================================

describe('NotebookReadSchema', () => {
  it('should parse valid path', () => {
    const result = NotebookReadSchema.safeParse({ path: '/tmp/test.ipynb' });
    expect(result.success).toBe(true);
  });

  it('should require path', () => {
    const result = NotebookReadSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('NotebookCreateSchema', () => {
  it('should parse valid input', () => {
    const result = NotebookCreateSchema.safeParse({ path: '/tmp/test.ipynb' });
    expect(result.success).toBe(true);
  });

  it('should accept optional kernel', () => {
    const result = NotebookCreateSchema.safeParse({ path: '/tmp/test.ipynb', kernel: 'python3' });
    expect(result.success).toBe(true);
  });
});

describe('NotebookEditCellSchema', () => {
  it('should parse valid input', () => {
    const result = NotebookEditCellSchema.safeParse({
      path: '/tmp/test.ipynb',
      cell_index: 0,
      new_source: 'print("hello")',
    });
    expect(result.success).toBe(true);
  });

  it('should accept optional cell_type', () => {
    const result = NotebookEditCellSchema.safeParse({
      path: '/tmp/test.ipynb',
      cell_index: 0,
      new_source: '# Title',
      cell_type: 'markdown',
    });
    expect(result.success).toBe(true);
  });

  it('should reject negative cell_index', () => {
    const result = NotebookEditCellSchema.safeParse({
      path: '/tmp/test.ipynb',
      cell_index: -1,
      new_source: 'code',
    });
    expect(result.success).toBe(false);
  });
});

describe('NotebookInsertCellSchema', () => {
  it('should parse valid input', () => {
    const result = NotebookInsertCellSchema.safeParse({
      path: '/tmp/test.ipynb',
      after_index: 0,
      cell_type: 'code',
      source: 'x = 1',
    });
    expect(result.success).toBe(true);
  });

  it('should accept after_index=-1', () => {
    const result = NotebookInsertCellSchema.safeParse({
      path: '/tmp/test.ipynb',
      after_index: -1,
      cell_type: 'markdown',
      source: '# Title',
    });
    expect(result.success).toBe(true);
  });
});

describe('NotebookDeleteCellSchema', () => {
  it('should parse valid input', () => {
    const result = NotebookDeleteCellSchema.safeParse({
      path: '/tmp/test.ipynb',
      cell_index: 0,
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Description Tests
// ============================================================================

describe('Tool Descriptions', () => {
  it('should have non-empty descriptions', () => {
    expect(NOTEBOOK_READ_DESCRIPTION.length).toBeGreaterThan(10);
    expect(NOTEBOOK_CREATE_DESCRIPTION.length).toBeGreaterThan(10);
    expect(NOTEBOOK_EDIT_CELL_DESCRIPTION.length).toBeGreaterThan(10);
    expect(NOTEBOOK_INSERT_CELL_DESCRIPTION.length).toBeGreaterThan(10);
    expect(NOTEBOOK_DELETE_CELL_DESCRIPTION.length).toBeGreaterThan(10);
  });

  it('should mention notebook or cell', () => {
    expect(NOTEBOOK_READ_DESCRIPTION).toMatch(/notebook|cell/i);
    expect(NOTEBOOK_CREATE_DESCRIPTION).toMatch(/notebook/i);
    expect(NOTEBOOK_EDIT_CELL_DESCRIPTION).toMatch(/cell/i);
  });
});

// ============================================================================
// Tool Factory & Behavior Tests
// ============================================================================

describe('createNotebookCreateTool', () => {
  it('should create tool with name notebook_create', () => {
    const tool = createNotebookCreateTool();
    expect(tool.name).toBe('notebook_create');
  });

  it('should create a valid notebook file', async () => {
    const tool = createNotebookCreateTool();
    const nbPath = path.join(tmpDir, 'test.ipynb');
    const result = await tool.func({ path: nbPath });
    expect(result).toContain('Created empty notebook');

    const content = JSON.parse(await fs.readFile(nbPath, 'utf-8'));
    expect(content.nbformat).toBe(4);
    expect(content.cells).toEqual([]);
  });
});

describe('createNotebookInsertCellTool', () => {
  it('should insert a cell into a notebook', async () => {
    const nbPath = path.join(tmpDir, 'test.ipynb');
    await createNotebookCreateTool().func({ path: nbPath });

    const tool = createNotebookInsertCellTool();
    const result = await tool.func({
      path: nbPath,
      after_index: -1,
      cell_type: 'code',
      source: 'print("hello")',
    });
    expect(result).toContain('Inserted code cell');

    const nb = JSON.parse(await fs.readFile(nbPath, 'utf-8'));
    expect(nb.cells.length).toBe(1);
    expect(nb.cells[0].cell_type).toBe('code');
  });

  it('should insert markdown cell', async () => {
    const nbPath = path.join(tmpDir, 'test.ipynb');
    await createNotebookCreateTool().func({ path: nbPath });
    await createNotebookInsertCellTool().func({
      path: nbPath,
      after_index: -1,
      cell_type: 'markdown',
      source: '# Title',
    });

    const nb = JSON.parse(await fs.readFile(nbPath, 'utf-8'));
    expect(nb.cells[0].cell_type).toBe('markdown');
  });
});

describe('createNotebookReadTool', () => {
  it('should read notebook with cells', async () => {
    const nbPath = path.join(tmpDir, 'test.ipynb');
    await createNotebookCreateTool().func({ path: nbPath });
    await createNotebookInsertCellTool().func({
      path: nbPath,
      after_index: -1,
      cell_type: 'code',
      source: 'x = 1\ny = 2',
    });

    const tool = createNotebookReadTool();
    const result = await tool.func({ path: nbPath });
    expect(result).toContain('Cells: 1');
    expect(result).toContain('[code]');
    expect(result).toContain('x = 1');
  });

  it('should handle missing file', async () => {
    const tool = createNotebookReadTool();
    const result = await tool.func({ path: '/nonexistent/test.ipynb' });
    expect(result).toContain('Error');
  });
});

describe('createNotebookEditCellTool', () => {
  it('should edit cell content', async () => {
    const nbPath = path.join(tmpDir, 'test.ipynb');
    await createNotebookCreateTool().func({ path: nbPath });
    await createNotebookInsertCellTool().func({
      path: nbPath,
      after_index: -1,
      cell_type: 'code',
      source: 'old code',
    });

    const tool = createNotebookEditCellTool();
    const result = await tool.func({
      path: nbPath,
      cell_index: 0,
      new_source: 'new code',
    });
    expect(result).toContain('Edited cell 0');

    const nb = JSON.parse(await fs.readFile(nbPath, 'utf-8'));
    const src = nb.cells[0].source.join('');
    expect(src).toContain('new code');
  });

  it('should change cell type', async () => {
    const nbPath = path.join(tmpDir, 'test.ipynb');
    await createNotebookCreateTool().func({ path: nbPath });
    await createNotebookInsertCellTool().func({
      path: nbPath,
      after_index: -1,
      cell_type: 'code',
      source: '# Title',
    });

    await createNotebookEditCellTool().func({
      path: nbPath,
      cell_index: 0,
      new_source: '# Updated Title',
      cell_type: 'markdown',
    });

    const nb = JSON.parse(await fs.readFile(nbPath, 'utf-8'));
    expect(nb.cells[0].cell_type).toBe('markdown');
  });

  it('should report out of range', async () => {
    const nbPath = path.join(tmpDir, 'test.ipynb');
    await createNotebookCreateTool().func({ path: nbPath });

    const tool = createNotebookEditCellTool();
    const result = await tool.func({
      path: nbPath,
      cell_index: 5,
      new_source: 'code',
    });
    expect(result).toContain('out of range');
  });
});

describe('createNotebookDeleteCellTool', () => {
  it('should delete a cell', async () => {
    const nbPath = path.join(tmpDir, 'test.ipynb');
    await createNotebookCreateTool().func({ path: nbPath });
    await createNotebookInsertCellTool().func({
      path: nbPath,
      after_index: -1,
      cell_type: 'code',
      source: 'cell 0',
    });
    await createNotebookInsertCellTool().func({
      path: nbPath,
      after_index: 0,
      cell_type: 'code',
      source: 'cell 1',
    });

    const tool = createNotebookDeleteCellTool();
    const result = await tool.func({ path: nbPath, cell_index: 0 });
    expect(result).toContain('Deleted cell 0');
    expect(result).toContain('1 cells remaining');

    const nb = JSON.parse(await fs.readFile(nbPath, 'utf-8'));
    expect(nb.cells.length).toBe(1);
    expect(nb.cells[0].source.join('')).toContain('cell 1');
  });

  it('should report out of range', async () => {
    const nbPath = path.join(tmpDir, 'test.ipynb');
    await createNotebookCreateTool().func({ path: nbPath });

    const tool = createNotebookDeleteCellTool();
    const result = await tool.func({ path: nbPath, cell_index: 99 });
    expect(result).toContain('out of range');
  });
});
