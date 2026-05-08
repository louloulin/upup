/**
 * Tests for LSP Tools
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LSPCompleteSchema,
  LSPDefinitionSchema,
  LSPReferencesSchema,
  LSPHoverSchema,
  LSPDiagnosticsSchema,
  createLSPCompleteTool,
  createLSPDefinitionTool,
  createLSPReferencesTool,
  createLSPHoverTool,
  createLSPDiagnosticsTool,
  getMockLSPClient,
  resetLSPClient,
} from './lsp-tools.js';

beforeEach(() => {
  resetLSPClient();
});

// ============================================================================
// Schema Tests
// ============================================================================

describe('LSPCompleteSchema', () => {
  it('should parse valid input', () => {
    const result = LSPCompleteSchema.safeParse({ uri: 'file:///test.ts', line: 5, column: 10 });
    expect(result.success).toBe(true);
  });

  it('should reject missing uri', () => {
    const result = LSPCompleteSchema.safeParse({ line: 5, column: 10 });
    expect(result.success).toBe(false);
  });

  it('should reject negative line', () => {
    const result = LSPCompleteSchema.safeParse({ uri: 'file:///test.ts', line: -1, column: 0 });
    expect(result.success).toBe(false);
  });
});

describe('LSPDefinitionSchema', () => {
  it('should parse valid input', () => {
    const result = LSPDefinitionSchema.safeParse({ uri: 'file:///test.ts', line: 0, column: 5 });
    expect(result.success).toBe(true);
  });
});

describe('LSPReferencesSchema', () => {
  it('should parse with includeDeclaration', () => {
    const result = LSPReferencesSchema.safeParse({ uri: 'file:///test.ts', line: 0, column: 5, includeDeclaration: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.includeDeclaration).toBe(false);
    }
  });

  it('should default includeDeclaration to true', () => {
    const result = LSPReferencesSchema.safeParse({ uri: 'file:///test.ts', line: 0, column: 5 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.includeDeclaration).toBe(true);
    }
  });
});

describe('LSPHoverSchema', () => {
  it('should parse valid input', () => {
    const result = LSPHoverSchema.safeParse({ uri: 'file:///test.ts', line: 0, column: 0 });
    expect(result.success).toBe(true);
  });
});

describe('LSPDiagnosticsSchema', () => {
  it('should parse valid input', () => {
    const result = LSPDiagnosticsSchema.safeParse({ uri: 'file:///test.ts' });
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Tool Factory Tests
// ============================================================================

describe('createLSPCompleteTool', () => {
  it('should create tool with correct name', () => {
    const tool = createLSPCompleteTool();
    expect(tool.name).toBe('lsp_complete');
  });

  it('should return completions', async () => {
    const mock = getMockLSPClient();
    mock.registerCompletions('file:///test.ts', [
      { label: 'hello', kind: 'function', detail: '() => void' },
      { label: 'world', kind: 'variable' },
    ]);

    const tool = createLSPCompleteTool();
    const result = await tool.func({ uri: 'file:///test.ts', line: 0, column: 0 });
    expect(result).toContain('Completions (2)');
    expect(result).toContain('hello');
    expect(result).toContain('world');
  });

  it('should return no completions message', async () => {
    const tool = createLSPCompleteTool();
    const result = await tool.func({ uri: 'file:///empty.ts', line: 0, column: 0 });
    expect(result).toContain('No completions');
  });
});

describe('createLSPDefinitionTool', () => {
  it('should create tool with correct name', () => {
    const tool = createLSPDefinitionTool();
    expect(tool.name).toBe('lsp_definition');
  });

  it('should return definitions', async () => {
    const mock = getMockLSPClient();
    mock.registerDefinitions('file:///test.ts', [
      { uri: 'file:///src/utils.ts', range: { startLine: 10, startColumn: 0, endLine: 15, endColumn: 1 } },
    ]);

    const tool = createLSPDefinitionTool();
    const result = await tool.func({ uri: 'file:///test.ts', line: 5, column: 10 });
    expect(result).toContain('Definitions (1)');
    expect(result).toContain('utils.ts:11:1');
  });

  it('should return no definitions message', async () => {
    const tool = createLSPDefinitionTool();
    const result = await tool.func({ uri: 'file:///test.ts', line: 0, column: 0 });
    expect(result).toContain('No definitions found');
  });
});

describe('createLSPReferencesTool', () => {
  it('should create tool with correct name', () => {
    const tool = createLSPReferencesTool();
    expect(tool.name).toBe('lsp_references');
  });

  it('should return references', async () => {
    const mock = getMockLSPClient();
    mock.registerReferences('file:///test.ts', [
      { uri: 'file:///src/a.ts', line: 5, column: 10, text: 'hello()' },
      { uri: 'file:///src/b.ts', line: 20, column: 0, text: 'const x = hello' },
    ]);

    const tool = createLSPReferencesTool();
    const result = await tool.func({ uri: 'file:///test.ts', line: 0, column: 0, includeDeclaration: true });
    expect(result).toContain('References (2)');
    expect(result).toContain('a.ts:6:11');
    expect(result).toContain('hello()');
  });

  it('should return no references message', async () => {
    const tool = createLSPReferencesTool();
    const result = await tool.func({ uri: 'file:///test.ts', line: 0, column: 0 });
    expect(result).toContain('No references found');
  });
});

describe('createLSPHoverTool', () => {
  it('should create tool with correct name', () => {
    const tool = createLSPHoverTool();
    expect(tool.name).toBe('lsp_hover');
  });

  it('should return hover info', async () => {
    const mock = getMockLSPClient();
    mock.registerHover('file:///test.ts', {
      contents: '```typescript\nfunction hello(): void\n```',
      range: { startLine: 5, endLine: 5 },
    });

    const tool = createLSPHoverTool();
    const result = await tool.func({ uri: 'file:///test.ts', line: 5, column: 0 });
    expect(result).toContain('function hello()');
    expect(result).toContain('lines 6-6');
  });

  it('should return no hover message', async () => {
    const tool = createLSPHoverTool();
    const result = await tool.func({ uri: 'file:///test.ts', line: 0, column: 0 });
    expect(result).toContain('No hover information');
  });
});

describe('createLSPDiagnosticsTool', () => {
  it('should create tool with correct name', () => {
    const tool = createLSPDiagnosticsTool();
    expect(tool.name).toBe('lsp_diagnostics');
  });

  it('should return diagnostics', async () => {
    const mock = getMockLSPClient();
    mock.registerDiagnostics('file:///test.ts', [
      { severity: 'error', message: "Cannot find name 'foo'", line: 10, column: 5, code: '2304' },
      { severity: 'warning', message: 'Unused variable', line: 15, column: 0 },
    ]);

    const tool = createLSPDiagnosticsTool();
    const result = await tool.func({ uri: 'file:///test.ts' });
    expect(result).toContain('Diagnostics (2)');
    expect(result).toContain('[ERROR]');
    expect(result).toContain('Cannot find name');
    expect(result).toContain('[WARNING]');
  });

  it('should return no diagnostics message', async () => {
    const tool = createLSPDiagnosticsTool();
    const result = await tool.func({ uri: 'file:///clean.ts' });
    expect(result).toContain('No diagnostics found');
  });
});
