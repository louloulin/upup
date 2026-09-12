import { createHash } from 'node:crypto';
import type { UpUpToolContract, UpUpToolCategory, UpUpToolSafetyLevel } from './types.js';
import type { FinancialToolDetails, UpUpDataPolicy } from './types.js';
import type { RegisteredTool, ToolCategory, ToolSafetyLevel } from '../../tools/registry/types.js';
import { getToolRegistry } from '../../tools/registry/index.js';

const categoryMap: Record<ToolCategory, UpUpToolCategory> = {
  financial: 'finance', search: 'research', browser: 'network', filesystem: 'filesystem', memory: 'system',
  agent: 'system', system: 'system', compute: 'valuation', network: 'network', execute: 'system', data: 'market',
  collaboration: 'system', mcp: 'network',
};

function safetyForTool(tool: RegisteredTool): UpUpToolSafetyLevel {
  const level: ToolSafetyLevel = tool.concurrencyMetadata?.safetyLevel ?? (tool.concurrencySafe ? 'safe' : 'warning');
  return level;
}

function categoryForTool(tool: RegisteredTool): UpUpToolCategory {
  return categoryMap[tool.concurrencyMetadata?.category ?? 'system'];
}

function parseToolValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

const SENSITIVE_KEYS = new Set(['api_key', 'apikey', 'authorization', 'credential', 'password', 'secret', 'token', 'access_token', 'refresh_token']);

function redactSensitive(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_KEYS.has(key.toLowerCase())) return '[REDACTED]';
  if (key?.toLowerCase() === 'sourceurls' && Array.isArray(value)) {
    return value.map((source) => typeof source === 'string' ? sanitizeSource(source) : redactSensitive(source));
  }
  if (Array.isArray(value)) return value.map((child) => redactSensitive(child));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [childKey, redactSensitive(child, childKey)]));
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function findAsOf(value: unknown): string | undefined {
  const record = getRecord(value);
  if (!record) return undefined;
  for (const key of ['asOf', 'as_of', 'date', 'trade_date', 'report_period', 'period']) {
    const candidate = record[key];
    if (typeof candidate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(candidate)) return candidate.slice(0, 10);
  }
  for (const child of Object.values(record)) {
    const nested = findAsOf(child);
    if (nested) return nested;
  }
  return undefined;
}

function sanitizeSource(source: string): string {
  try {
    const url = new URL(source);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return source.replace(/[?#].*$/, '');
  }
}

function sourceUrls(value: unknown): string[] {
  const record = getRecord(value);
  const sources = record?.sourceUrls;
  if (!Array.isArray(sources)) return [];
  return sources.filter((source): source is string => typeof source === 'string' && source.length > 0).map(sanitizeSource);
}

function dataPolicy(tool: RegisteredTool): UpUpDataPolicy {
  const name = tool.name.toLowerCase();
  if (name.includes('backtest') || name.includes('historical') || name.includes('filing')) return 'historical';
  return 'live';
}

function evidenceDetails(tool: RegisteredTool, value: unknown, auditId: string): FinancialToolDetails {
  const retrievedAt = new Date().toISOString();
  const parsed = redactSensitive(parseToolValue(value));
  const sources = sourceUrls(parsed);
  const source = sources[0] ?? `upup-tool://${tool.name}`;
  const payload = JSON.stringify(parsed);
  const warnings = sources.length === 0
    ? [`${tool.name} did not expose a source URL; adapter source is used for audit continuity.`]
    : [];
  return {
    evidence: [{
      id: `${auditId}:evidence:0`,
      source,
      retrievedAt,
      asOf: findAsOf(parsed) ?? retrievedAt.slice(0, 10),
      query: tool.name,
      dataHash: createHash('sha256').update(payload).digest('hex'),
      confidence: sources.length > 0 ? 'high' : 'medium',
    }],
    dataFreshness: dataPolicy(tool),
    ...(warnings.length > 0 ? { warnings } : {}),
    auditId,
  };
}

export function registeredToolToPiContract(tool: RegisteredTool): UpUpToolContract {
  const safetyLevel = safetyForTool(tool);
  return {
    name: tool.name,
    label: tool.name,
    description: tool.description ?? tool.compactDescription ?? tool.name,
    category: categoryForTool(tool),
    safetyLevel,
    parameters: tool.tool.parameters,
    maxConcurrent: tool.concurrencyMetadata?.maxConcurrent ?? (tool.concurrencySafe ? 5 : 1),
    hasFinancialImpact: tool.concurrencyMetadata?.sideEffects.hasFinancialImpact ?? false,
    async execute(input, context) {
      const value = await tool.tool.invoke(input as object, { signal: context.signal });
      const sanitized = redactSensitive(parseToolValue(value));
      const text = typeof sanitized === 'string' ? sanitized : JSON.stringify(sanitized);
      return { value: sanitized, text, details: evidenceDetails(tool, sanitized, context.auditId) };
    },
  };
}

export async function loadRegisteredPiToolContracts(model: string): Promise<readonly UpUpToolContract[]> {
  const tools = await getToolRegistry(model);
  return tools.filter((tool) => Boolean(tool?.tool)).map(registeredToolToPiContract);
}
