/**
 * LSPTool - Language Server Protocol integration
 *
 * Provides code intelligence features:
 * - Code completion at a position
 * - Go to definition
 * - Find references
 * - Get hover information
 * - Get diagnostics
 *
 * Uses a pluggable LSP client interface so real LSP servers can be
 * connected in production while tests use a mock implementation.
 *
 * Reference: Claude Code's LSPTool
 */

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';

// ============================================================================
// LSP Client Interface
// ============================================================================

export interface LSPCompletionItem {
  label: string;
  kind?: string;
  detail?: string;
  documentation?: string;
}

export interface LSPDefinition {
  uri: string;
  range: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
}

export interface LSPReference {
  uri: string;
  line: number;
  column: number;
  text: string;
}

export interface LSPHover {
  contents: string;
  range?: {
    startLine: number;
    endLine: number;
  };
}

export interface LSPDiagnostic {
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  line: number;
  column: number;
  code?: string;
}

export interface LSPClient {
  complete(uri: string, line: number, column: number): Promise<LSPCompletionItem[]>;
  definition(uri: string, line: number, column: number): Promise<LSPDefinition[]>;
  references(uri: string, line: number, column: number): Promise<LSPReference[]>;
  hover(uri: string, line: number, column: number): Promise<LSPHover | null>;
  diagnostics(uri: string): Promise<LSPDiagnostic[]>;
}

// ============================================================================
// In-Memory Mock LSP Client (for testing and fallback)
// ============================================================================

class MockLSPClient implements LSPClient {
  private readonly completions: Map<string, LSPCompletionItem[]> = new Map();
  private readonly definitions: Map<string, LSPDefinition[]> = new Map();
  private readonly refs: Map<string, LSPReference[]> = new Map();
  private readonly hovers: Map<string, LSPHover> = new Map();
  private readonly diags: Map<string, LSPDiagnostic[]> = new Map();

  registerCompletions(uri: string, items: LSPCompletionItem[]): void {
    this.completions.set(uri, items);
  }

  registerDefinitions(uri: string, defs: LSPDefinition[]): void {
    this.definitions.set(uri, defs);
  }

  registerReferences(uri: string, refs: LSPReference[]): void {
    this.refs.set(uri, refs);
  }

  registerHover(uri: string, hover: LSPHover): void {
    this.hovers.set(uri, hover);
  }

  registerDiagnostics(uri: string, diags: LSPDiagnostic[]): void {
    this.diags.set(uri, diags);
  }

  async complete(uri: string): Promise<LSPCompletionItem[]> {
    return this.completions.get(uri) ?? [];
  }

  async definition(uri: string): Promise<LSPDefinition[]> {
    return this.definitions.get(uri) ?? [];
  }

  async references(uri: string): Promise<LSPReference[]> {
    return this.refs.get(uri) ?? [];
  }

  async hover(uri: string): Promise<LSPHover | null> {
    return this.hovers.get(uri) ?? null;
  }

  async diagnostics(uri: string): Promise<LSPDiagnostic[]> {
    return this.diags.get(uri) ?? [];
  }
}

// ============================================================================
// Global LSP Client Management
// ============================================================================

let globalLspClient: LSPClient = new MockLSPClient();

export function setLSPClient(client: LSPClient): void {
  globalLspClient = client;
}

export function getLSPClient(): LSPClient {
  return globalLspClient;
}

export function getMockLSPClient(): MockLSPClient {
  if (!(globalLspClient instanceof MockLSPClient)) {
    globalLspClient = new MockLSPClient();
  }
  return globalLspClient as MockLSPClient;
}

export function resetLSPClient(): void {
  globalLspClient = new MockLSPClient();
}

// ============================================================================
// Schemas & Descriptions
// ============================================================================

export const LSPCompleteSchema = z.object({
  uri: z.string().describe('File URI or path'),
  line: z.number().min(0).describe('Line number (0-based)'),
  column: z.number().min(0).describe('Column number (0-based)'),
});

export const LSPDefinitionSchema = z.object({
  uri: z.string().describe('File URI or path'),
  line: z.number().min(0).describe('Line number (0-based)'),
  column: z.number().min(0).describe('Column number (0-based)'),
});

export const LSPReferencesSchema = z.object({
  uri: z.string().describe('File URI or path'),
  line: z.number().min(0).describe('Line number (0-based)'),
  column: z.number().min(0).describe('Column number (0-based)'),
  includeDeclaration: z.boolean().optional().default(true).describe('Include declaration in results'),
});

export const LSPHoverSchema = z.object({
  uri: z.string().describe('File URI or path'),
  line: z.number().min(0).describe('Line number (0-based)'),
  column: z.number().min(0).describe('Column number (0-based)'),
});

export const LSPDiagnosticsSchema = z.object({
  uri: z.string().describe('File URI or path'),
});

export const LSP_COMPLETE_DESCRIPTION = `
Get code completions at a specific position in a file.

Returns a list of completion items with labels, kinds, and documentation.
Useful for discovering available methods, properties, and variables.`;

export const LSP_DEFINITION_DESCRIPTION = `
Find the definition(s) of a symbol at a specific position.

Returns locations where the symbol is defined. Useful for jumping to
the source of a function, class, or variable.`;

export const LSP_REFERENCES_DESCRIPTION = `
Find all references to a symbol at a specific position.

Returns locations where the symbol is referenced across the codebase.
Useful for understanding the impact of changes.`;

export const LSP_HOVER_DESCRIPTION = `
Get hover information for a symbol at a specific position.

Returns type information, documentation, and other details.
Useful for understanding what a symbol is and how to use it.`;

export const LSP_DIAGNOSTICS_DESCRIPTION = `
Get diagnostics (errors, warnings) for a file.

Returns a list of issues found in the file with severity and location.
Useful for finding and fixing problems in code.`;

// ============================================================================
// Tool Factories
// ============================================================================

export function createLSPCompleteTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'lsp_complete',
    description: LSP_COMPLETE_DESCRIPTION,
    schema: LSPCompleteSchema,
    async func(input): Promise<string> {
      const items = await globalLspClient.complete(input.uri, input.line, input.column);
      if (items.length === 0) {
        return 'No completions available.';
      }

      const lines = [`Completions (${items.length}):`];
      for (const item of items) {
        let line = `  ${item.label}`;
        if (item.kind) line += ` [${item.kind}]`;
        if (item.detail) line += ` - ${item.detail}`;
        lines.push(line);
      }
      return lines.join('\n');
    },
  });
}

export function createLSPDefinitionTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'lsp_definition',
    description: LSP_DEFINITION_DESCRIPTION,
    schema: LSPDefinitionSchema,
    async func(input): Promise<string> {
      const defs = await globalLspClient.definition(input.uri, input.line, input.column);
      if (defs.length === 0) {
        return 'No definitions found.';
      }

      const lines = [`Definitions (${defs.length}):`];
      for (const def of defs) {
        lines.push(`  ${def.uri}:${def.range.startLine + 1}:${def.range.startColumn + 1}`);
      }
      return lines.join('\n');
    },
  });
}

export function createLSPReferencesTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'lsp_references',
    description: LSP_REFERENCES_DESCRIPTION,
    schema: LSPReferencesSchema,
    async func(input): Promise<string> {
      const refs = await globalLspClient.references(input.uri, input.line, input.column);
      if (refs.length === 0) {
        return 'No references found.';
      }

      const lines = [`References (${refs.length}):`];
      for (const ref of refs) {
        lines.push(`  ${ref.uri}:${ref.line + 1}:${ref.column + 1}`);
        lines.push(`    ${ref.text}`);
      }
      return lines.join('\n');
    },
  });
}

export function createLSPHoverTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'lsp_hover',
    description: LSP_HOVER_DESCRIPTION,
    schema: LSPHoverSchema,
    async func(input): Promise<string> {
      const hover = await globalLspClient.hover(input.uri, input.line, input.column);
      if (!hover) {
        return 'No hover information available.';
      }

      let result = hover.contents;
      if (hover.range) {
        result += `\nRange: lines ${hover.range.startLine + 1}-${hover.range.endLine + 1}`;
      }
      return result;
    },
  });
}

export function createLSPDiagnosticsTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'lsp_diagnostics',
    description: LSP_DIAGNOSTICS_DESCRIPTION,
    schema: LSPDiagnosticsSchema,
    async func(input): Promise<string> {
      const diags = await globalLspClient.diagnostics(input.uri);
      if (diags.length === 0) {
        return 'No diagnostics found.';
      }

      const lines = [`Diagnostics (${diags.length}):`];
      for (const d of diags) {
        let line = `  [${d.severity.toUpperCase()}] line ${d.line + 1}:${d.column + 1}`;
        if (d.code) line += ` (${d.code})`;
        line += `: ${d.message}`;
        lines.push(line);
      }
      return lines.join('\n');
    },
  });
}

// ============================================================================
// Module Exports
// ============================================================================
