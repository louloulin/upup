/**
 * NotebookEditTool - Jupyter notebook editing
 *
 * Provides tools for reading, creating, and editing Jupyter notebooks (.ipynb).
 * Supports cell insertion, deletion, modification, and notebook-level operations.
 */

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import fs from 'fs/promises';
import path from 'path';

// ============================================================================
// Types
// ============================================================================

interface NotebookCell {
  cell_type: 'code' | 'markdown';
  source: string[];
  metadata?: Record<string, unknown>;
  outputs?: unknown[];
  execution_count?: number | null;
}

interface Notebook {
  nbformat: number;
  nbformat_minor: number;
  metadata: Record<string, unknown>;
  cells: NotebookCell[];
}

function createEmptyNotebook(): Notebook {
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: {
        display_name: 'Python 3',
        language: 'python',
        name: 'python3',
      },
      language_info: { name: 'python', version: '3.11.0' },
    },
    cells: [],
  };
}

function createCell(type: 'code' | 'markdown', source: string): NotebookCell {
  return {
    cell_type: type,
    source: source.split('\n').map((line, i, arr) =>
      i < arr.length - 1 ? line + '\n' : line
    ),
    metadata: {},
    ...(type === 'code'
      ? { outputs: [], execution_count: null }
      : {}),
  };
}

// ============================================================================
// Schemas
// ============================================================================

export const NotebookReadSchema = z.object({
  /** Path to the notebook file */
  path: z.string().min(1).describe('Absolute path to the .ipynb file'),
});

export const NotebookCreateSchema = z.object({
  /** Path for the new notebook */
  path: z.string().min(1).describe('Absolute path for the new .ipynb file'),
  /** Optional kernel name */
  kernel: z.string().optional().describe('Kernel name (default: python3)'),
});

export const NotebookEditCellSchema = z.object({
  /** Path to the notebook */
  path: z.string().min(1).describe('Absolute path to the .ipynb file'),
  /** 0-based cell index */
  cell_index: z.number().int().min(0).describe('0-based cell index to edit'),
  /** New cell source content */
  new_source: z.string().describe('New source content for the cell'),
  /** Optional: change cell type */
  cell_type: z.enum(['code', 'markdown']).optional().describe('Change cell type'),
});

export const NotebookInsertCellSchema = z.object({
  /** Path to the notebook */
  path: z.string().min(1).describe('Absolute path to the .ipynb file'),
  /** Insert after this cell index (-1 for beginning) */
  after_index: z.number().int().min(-1).describe('Insert after this cell index (-1 for beginning)'),
  /** Cell type */
  cell_type: z.enum(['code', 'markdown']).describe('Cell type'),
  /** Cell source content */
  source: z.string().describe('Cell source content'),
});

export const NotebookDeleteCellSchema = z.object({
  /** Path to the notebook */
  path: z.string().min(1).describe('Absolute path to the .ipynb file'),
  /** 0-based cell index to delete */
  cell_index: z.number().int().min(0).describe('0-based cell index to delete'),
});

// ============================================================================
// Helpers
// ============================================================================

async function readNotebook(filePath: string): Promise<Notebook> {
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content) as Notebook;
}

async function writeNotebook(filePath: string, notebook: Notebook): Promise<void> {
  const content = JSON.stringify(notebook, null, 1) + '\n';
  await fs.writeFile(filePath, content, 'utf-8');
}

// ============================================================================
// Tool Descriptions
// ============================================================================

export const NOTEBOOK_READ_DESCRIPTION = `
Read a Jupyter notebook (.ipynb) file and list its cells.

Use this when:
- Viewing notebook contents
- Checking cell types and count
- Getting an overview of a notebook's structure

Returns cell count and a summary of each cell (type, first line, line count).`;

export const NOTEBOOK_CREATE_DESCRIPTION = `
Create a new empty Jupyter notebook (.ipynb).

Use this when:
- Starting a new analysis notebook
- Creating a notebook for documentation
- Setting up a notebook template

The notebook is created with Python 3 kernel by default.`;

export const NOTEBOOK_EDIT_CELL_DESCRIPTION = `
Edit a cell in a Jupyter notebook.

Use this when:
- Modifying cell content
- Changing cell type (code ↔ markdown)
- Fixing code in existing cells

Specify the 0-based cell index and new source content.`;

export const NOTEBOOK_INSERT_CELL_DESCRIPTION = `
Insert a new cell into a Jupyter notebook.

Use this when:
- Adding new code or markdown cells
- Building up a notebook programmatically
- Inserting cells at specific positions

Use after_index=-1 to insert at the beginning.`;

export const NOTEBOOK_DELETE_CELL_DESCRIPTION = `
Delete a cell from a Jupyter notebook.

Use this when:
- Removing unwanted cells
- Cleaning up notebook structure

Specify the 0-based cell index to delete.`;

// ============================================================================
// Tool Factories
// ============================================================================

export function createNotebookReadTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'notebook_read',
    description: NOTEBOOK_READ_DESCRIPTION,
    schema: NotebookReadSchema,
    async func(input): Promise<string> {
      try {
        const nb = await readNotebook(input.path);
        const lines = [
          `Notebook: ${path.basename(input.path)}`,
          `Format: nbformat ${nb.nbformat}.${nb.nbformat_minor}`,
          `Cells: ${nb.cells.length}\n`,
        ];

        for (let i = 0; i < nb.cells.length; i++) {
          const cell = nb.cells[i];
          const src = Array.isArray(cell.source) ? cell.source.join('') : String(cell.source);
          const firstLine = src.split('\n')[0]?.slice(0, 60) || '(empty)';
          const icon = cell.cell_type === 'code' ? '[code]' : '[md]';
          lines.push(`  ${i}: ${icon} (${src.split('\n').length} lines) ${firstLine}`);
        }

        return lines.join('\n');
      } catch (err) {
        return `Error reading notebook: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });
}

export function createNotebookCreateTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'notebook_create',
    description: NOTEBOOK_CREATE_DESCRIPTION,
    schema: NotebookCreateSchema,
    async func(input): Promise<string> {
      try {
        const nb = createEmptyNotebook();
        if (input.kernel) {
          nb.metadata.kernelspec = {
            display_name: input.kernel,
            language: 'python',
            name: input.kernel,
          };
        }
        await writeNotebook(input.path, nb);
        return `Created empty notebook: ${input.path}`;
      } catch (err) {
        return `Error creating notebook: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });
}

export function createNotebookEditCellTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'notebook_edit_cell',
    description: NOTEBOOK_EDIT_CELL_DESCRIPTION,
    schema: NotebookEditCellSchema,
    async func(input): Promise<string> {
      try {
        const nb = await readNotebook(input.path);
        if (input.cell_index >= nb.cells.length) {
          return `Cell index ${input.cell_index} out of range (notebook has ${nb.cells.length} cells).`;
        }

        const cell = nb.cells[input.cell_index];
        cell.source = input.new_source.split('\n').map((line: string, i: number, arr: string[]) =>
          i < arr.length - 1 ? line + '\n' : line
        );
        if (input.cell_type) {
          cell.cell_type = input.cell_type;
          if (input.cell_type === 'code' && !cell.outputs) {
            cell.outputs = [];
            cell.execution_count = null;
          }
        }

        await writeNotebook(input.path, nb);
        return `Edited cell ${input.cell_index} in ${path.basename(input.path)}`;
      } catch (err) {
        return `Error editing cell: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });
}

export function createNotebookInsertCellTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'notebook_insert_cell',
    description: NOTEBOOK_INSERT_CELL_DESCRIPTION,
    schema: NotebookInsertCellSchema,
    async func(input): Promise<string> {
      try {
        const nb = await readNotebook(input.path);
        const insertAt = input.after_index + 1;
        const cell = createCell(input.cell_type, input.source);

        nb.cells.splice(insertAt, 0, cell);
        await writeNotebook(input.path, nb);
        return `Inserted ${input.cell_type} cell at index ${insertAt} in ${path.basename(input.path)}`;
      } catch (err) {
        return `Error inserting cell: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });
}

export function createNotebookDeleteCellTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'notebook_delete_cell',
    description: NOTEBOOK_DELETE_CELL_DESCRIPTION,
    schema: NotebookDeleteCellSchema,
    async func(input): Promise<string> {
      try {
        const nb = await readNotebook(input.path);
        if (input.cell_index >= nb.cells.length) {
          return `Cell index ${input.cell_index} out of range (notebook has ${nb.cells.length} cells).`;
        }

        nb.cells.splice(input.cell_index, 1);
        await writeNotebook(input.path, nb);
        return `Deleted cell ${input.cell_index} from ${path.basename(input.path)}. ${nb.cells.length} cells remaining.`;
      } catch (err) {
        return `Error deleting cell: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });
}

// ============================================================================
// Module Exports
// ============================================================================
