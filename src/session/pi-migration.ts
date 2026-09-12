import { createHash, randomUUID } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { SessionManager } from '@earendil-works/pi-coding-agent';

type LegacyMessage = {
  id?: string;
  type?: string;
  role?: string;
  content?: unknown;
  timestamp?: string | number;
  toolName?: string;
  toolResult?: unknown;
  toolUseId?: string;
  metadata?: Record<string, unknown>;
  parentUuid?: string;
};

type LegacySession = {
  metadata?: {
    id?: string;
    createdAt?: string | number;
    updatedAt?: string | number;
    modifiedAt?: string | number;
    model?: string;
    projectPath?: string;
    firstPrompt?: string;
    customTitle?: string;
  };
  transcript?: LegacyMessage[];
  messages?: LegacyMessage[];
};

export interface PiSessionMigrationOptions {
  outputPath: string;
  cwd?: string;
  sessionId?: string;
  dryRun?: boolean;
  backupPath?: string;
}

export interface PiSessionMigrationReport {
  sourcePath: string;
  targetPath: string;
  sourceHash: string;
  outputHash: string;
  sourceBytes: number;
  outputBytes: number;
  messageCount: number;
  dryRun: boolean;
  backupPath?: string;
  verified: boolean;
  warnings: readonly string[];
}

interface NormalizedMessage {
  sourceId: string;
  sourceParentId?: string;
  role: 'user' | 'assistant' | 'toolResult' | 'custom';
  content: string;
  timestamp: number;
  toolName?: string;
  toolCallId?: string;
  metadata?: Record<string, unknown>;
  customType?: string;
}

const ZERO_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function timestampValue(value: string | number | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function isoTimestamp(value: number): string {
  return new Date(value).toISOString();
}

function contentText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') return part.text;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (value === undefined || value === null) return '';
  return JSON.stringify(value);
}

function parseLegacySession(source: string): LegacySession {
  try {
    const parsed = JSON.parse(source) as LegacySession;
    if (!parsed || typeof parsed !== 'object') throw new Error('session JSON must be an object');
    return parsed;
  } catch {
    const entries = source
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as LegacyMessage & { metadata?: LegacySession['metadata']; transcript?: LegacyMessage[]; messages?: LegacyMessage[] });
    if (entries.length === 0) throw new Error('session file is empty');
    const first = entries[0];
    return {
      metadata: first.metadata,
      transcript: first.transcript,
      messages: first.messages ?? entries,
    };
  }
}

function normalizeMessages(session: LegacySession, warnings: string[]): NormalizedMessage[] {
  const source = session.transcript ?? session.messages ?? [];
  const normalized = source.reduce<NormalizedMessage[]>((result, message, index) => {
    const role = message.role ?? message.type ?? 'user';
    const timestamp = timestampValue(message.timestamp, Date.now() + index);
    const text = contentText(message.content);
    if (role === 'user' || role === 'human') {
      result.push({ sourceId: message.id ?? `legacy-${index}`, sourceParentId: message.parentUuid, role: 'user', content: text, timestamp, metadata: message.metadata });
      return result;
    }
    if (role === 'assistant' || role === 'ai') {
      result.push({ sourceId: message.id ?? `legacy-${index}`, sourceParentId: message.parentUuid, role: 'assistant', content: text, timestamp, metadata: message.metadata });
      return result;
    }
    if (role === 'tool' || role === 'tool_result' || role === 'toolResult') {
      const resultText = text || contentText(message.toolResult);
      result.push({
        sourceId: message.id ?? `legacy-${index}`,
        sourceParentId: message.parentUuid,
        role: 'toolResult',
        content: resultText,
        timestamp,
        toolName: message.toolName ?? 'legacy-tool',
        toolCallId: message.toolUseId ?? message.id ?? `legacy-call-${index}`,
        metadata: message.metadata,
      });
      return result;
    }
    warnings.push(`message ${index} role ${role} migrated as hidden custom message`);
    result.push({
      sourceId: message.id ?? `legacy-${index}`,
      sourceParentId: message.parentUuid,
      role: 'custom',
      content: text || contentText(message.toolResult),
      timestamp,
      metadata: message.metadata,
      customType: role === 'context_collapse_snapshot'
        ? 'upup-context-collapse-snapshot'
        : role === 'file_history_snapshot'
          ? 'upup-file-history-snapshot'
          : 'upup-legacy-message',
    });
    return result;
  }, []);
  return normalized.filter((message) => message.content.length > 0 || message.role === 'toolResult');
}

function stableEntryId(sessionId: string, index: number): string {
  return createHash('sha256').update(`${sessionId}:${index}`).digest('hex').slice(0, 8);
}

function buildPiSession(source: LegacySession, options: PiSessionMigrationOptions, warnings: string[]): { text: string; messageCount: number } {
  const metadata = source.metadata ?? {};
  const sessionId = options.sessionId ?? (metadata.id && /^[0-9a-f-]{8,}$/i.test(metadata.id) ? metadata.id : randomUUID());
  const cwd = resolve(options.cwd ?? metadata.projectPath ?? process.cwd());
  const createdAt = timestampValue(metadata.createdAt, Date.now());
  const messages = normalizeMessages(source, warnings);
  const entryIds = new Map<string, string>();
  messages.forEach((message, index) => entryIds.set(message.sourceId, stableEntryId(sessionId, index)));
  let parentId: string | null = null;
  const lines: string[] = [{
    type: 'session',
    version: 3,
    id: sessionId,
    timestamp: isoTimestamp(createdAt),
    cwd,
  }].map((entry) => JSON.stringify(entry));

  messages.forEach((message, index) => {
    const id = entryIds.get(message.sourceId) ?? stableEntryId(sessionId, index);
    const resolvedParentId = message.sourceParentId ? entryIds.get(message.sourceParentId) ?? parentId : parentId;
    const base = { type: 'message', id, parentId: resolvedParentId, timestamp: isoTimestamp(message.timestamp) };
    if (message.role === 'user') {
      lines.push(JSON.stringify({ ...base, message: { role: 'user', content: message.content, timestamp: message.timestamp } }));
    } else if (message.role === 'assistant') {
      lines.push(JSON.stringify({
        ...base,
        message: {
          role: 'assistant',
          content: message.content ? [{ type: 'text', text: message.content }] : [],
          api: 'openai-completions',
          provider: 'legacy',
          model: metadata.model ?? 'legacy',
          usage: ZERO_USAGE,
          stopReason: 'stop',
          timestamp: message.timestamp,
        },
      }));
    } else if (message.role === 'toolResult') {
      lines.push(JSON.stringify({
        ...base,
        message: {
          role: 'toolResult',
          toolCallId: message.toolCallId ?? `legacy-call-${index}`,
          toolName: message.toolName ?? 'legacy-tool',
          content: [{ type: 'text', text: message.content }],
          details: message.metadata,
          isError: false,
          timestamp: message.timestamp,
        },
      }));
    } else {
      lines.push(JSON.stringify({
        type: 'custom_message',
        id,
        parentId: resolvedParentId,
        timestamp: isoTimestamp(message.timestamp),
        customType: message.customType ?? 'upup-legacy-message',
        content: message.content,
        display: false,
        details: message.metadata,
      }));
    }
    parentId = id;
  });
  return { text: `${lines.join('\n')}\n`, messageCount: messages.length };
}

function verifyPiSession(path: string): { messageCount: number; sessionId: string } {
  const manager = SessionManager.open(path);
  const header = manager.getHeader();
  if (!header || header.type !== 'session' || header.version !== 3) throw new Error('Pi session header verification failed');
  const entries = manager.getEntries();
  const messageCount = entries.filter((entry) => entry.type === 'message' || entry.type === 'custom_message').length;
  return { messageCount, sessionId: manager.getSessionId() };
}

export function migrateSessionFile(sourcePath: string, options: PiSessionMigrationOptions): PiSessionMigrationReport {
  const source = resolve(sourcePath);
  const target = resolve(options.outputPath);
  if (source === target) throw new Error('Refusing to overwrite the source session file');
  if (!existsSync(source)) throw new Error(`Source session does not exist: ${source}`);
  if (!options.dryRun && existsSync(target)) throw new Error(`Target session already exists: ${target}`);

  const sourceText = readFileSync(source, 'utf8');
  const warnings: string[] = [];
  const parsed = parseLegacySession(sourceText);
  const output = buildPiSession(parsed, options, warnings);
  const sourceHash = hashText(sourceText);
  const outputHash = hashText(output.text);
  let backupPath: string | undefined;
  let verified = false;

  if (!options.dryRun) {
    mkdirSync(dirname(target), { recursive: true });
    if (options.backupPath) {
      backupPath = resolve(options.backupPath);
      if (existsSync(backupPath)) throw new Error(`Backup already exists: ${backupPath}`);
      mkdirSync(dirname(backupPath), { recursive: true });
      copyFileSync(source, backupPath);
    }
    const tempDir = mkdtempSync(join(tmpdir(), 'upup-pi-session-'));
    const tempPath = join(tempDir, 'session.jsonl');
    try {
      writeFileSync(tempPath, output.text, { flag: 'wx' });
      const check = verifyPiSession(tempPath);
      if (check.messageCount !== output.messageCount) throw new Error('Pi session message count verification failed');
      renameSync(tempPath, target);
      verified = verifyPiSession(target).messageCount === output.messageCount;
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  } else {
    const tempDir = mkdtempSync(join(tmpdir(), 'upup-pi-session-dry-run-'));
    const tempPath = join(tempDir, 'session.jsonl');
    try {
      writeFileSync(tempPath, output.text, { flag: 'wx' });
      verified = verifyPiSession(tempPath).messageCount === output.messageCount;
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  return {
    sourcePath: source,
    targetPath: target,
    sourceHash,
    outputHash,
    sourceBytes: Buffer.byteLength(sourceText),
    outputBytes: Buffer.byteLength(output.text),
    messageCount: output.messageCount,
    dryRun: options.dryRun ?? false,
    backupPath,
    verified,
    warnings,
  };
}
