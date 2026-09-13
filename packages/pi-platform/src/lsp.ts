export interface PlatformLspCompletionItem {
  readonly label: string;
  readonly kind?: string;
  readonly detail?: string;
  readonly documentation?: string;
}

export interface PlatformLspDefinition {
  readonly uri: string;
  readonly range: { readonly startLine: number; readonly startColumn: number; readonly endLine: number; readonly endColumn: number };
}

export interface PlatformLspReference {
  readonly uri: string;
  readonly line: number;
  readonly column: number;
  readonly text: string;
}

export interface PlatformLspHover {
  readonly contents: string;
  readonly range?: { readonly startLine: number; readonly endLine: number };
}

export interface PlatformLspDiagnostic {
  readonly severity: 'error' | 'warning' | 'info' | 'hint';
  readonly message: string;
  readonly line: number;
  readonly column: number;
  readonly code?: string;
}

export interface PlatformLspClient {
  complete(uri: string, line: number, column: number): Promise<readonly PlatformLspCompletionItem[]>;
  definition(uri: string, line: number, column: number): Promise<readonly PlatformLspDefinition[]>;
  references(uri: string, line: number, column: number): Promise<readonly PlatformLspReference[]>;
  hover(uri: string, line: number, column: number): Promise<PlatformLspHover | null>;
  diagnostics(uri: string): Promise<readonly PlatformLspDiagnostic[]>;
}

class EmptyPlatformLspClient implements PlatformLspClient {
  async complete(_uri: string, _line: number, _column: number): Promise<readonly PlatformLspCompletionItem[]> { return []; }
  async definition(_uri: string, _line: number, _column: number): Promise<readonly PlatformLspDefinition[]> { return []; }
  async references(_uri: string, _line: number, _column: number): Promise<readonly PlatformLspReference[]> { return []; }
  async hover(_uri: string, _line: number, _column: number): Promise<PlatformLspHover | null> { return null; }
  async diagnostics(_uri: string): Promise<readonly PlatformLspDiagnostic[]> { return []; }
}

let platformLspClient: PlatformLspClient = new EmptyPlatformLspClient();

export function setPlatformLspClient(client: PlatformLspClient): void { platformLspClient = client; }
export function getPlatformLspClient(): PlatformLspClient { return platformLspClient; }
export function resetPlatformLspClient(): void { platformLspClient = new EmptyPlatformLspClient(); }

export function formatPlatformLspCompletions(items: readonly PlatformLspCompletionItem[]): string {
  if (items.length === 0) return 'No completions available.';
  return [`Completions (${items.length}):`, ...items.map((item) => `  ${item.label}${item.kind ? ` [${item.kind}]` : ''}${item.detail ? ` - ${item.detail}` : ''}`)].join('\n');
}

export function formatPlatformLspDefinitions(definitions: readonly PlatformLspDefinition[]): string {
  if (definitions.length === 0) return 'No definitions found.';
  return [`Definitions (${definitions.length}):`, ...definitions.map((definition) => `  ${definition.uri}:${definition.range.startLine + 1}:${definition.range.startColumn + 1}`)].join('\n');
}

export function formatPlatformLspReferences(references: readonly PlatformLspReference[]): string {
  if (references.length === 0) return 'No references found.';
  return [`References (${references.length}):`, ...references.flatMap((reference) => [`  ${reference.uri}:${reference.line + 1}:${reference.column + 1}`, `    ${reference.text}`])].join('\n');
}

export function formatPlatformLspHover(hover: PlatformLspHover | null): string {
  if (!hover) return 'No hover information available.';
  return hover.range ? `${hover.contents}\nRange: lines ${hover.range.startLine + 1}-${hover.range.endLine + 1}` : hover.contents;
}

export function formatPlatformLspDiagnostics(diagnostics: readonly PlatformLspDiagnostic[]): string {
  if (diagnostics.length === 0) return 'No diagnostics found.';
  return [`Diagnostics (${diagnostics.length}):`, ...diagnostics.map((diagnostic) => `  [${diagnostic.severity.toUpperCase()}] line ${diagnostic.line + 1}:${diagnostic.column + 1}${diagnostic.code ? ` (${diagnostic.code})` : ''}: ${diagnostic.message}`)].join('\n');
}
