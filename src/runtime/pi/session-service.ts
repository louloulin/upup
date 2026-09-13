import { existsSync } from 'node:fs';
import { readdir, readFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { createPiAgentRuntime } from './agent-session-factory.js';
import type { UpUpAgentEvent, UpUpAgentSession, UpUpAgentSpec } from './types.js';
import type { SessionSummary } from '../../session/types.js';

export interface PiSessionCreateInput {
  id?: string;
  cwd?: string;
  model?: string;
  systemPrompt?: string;
  tools?: string[];
  metadata?: Record<string, unknown>;
  firstPrompt?: string;
}

export interface PiSessionSummary {
  id: string;
  state: 'idle' | 'running' | 'waiting' | 'completed' | 'error' | 'canceled';
  createdAt: number;
  lastActivity: number;
  metadata: Record<string, unknown>;
}

interface PiSessionRecord {
  session: UpUpAgentSession;
  summary: PiSessionSummary;
  cwd: string;
  metadata: Record<string, unknown>;
}

const runtime = createPiAgentRuntime();
const records = new Map<string, PiSessionRecord>();

function sessionDirectory(cwd: string): string {
  return resolve(process.env.UPUP_SESSION_DIR ?? join(cwd, '.upup', 'sessions'));
}

function specFor(input: PiSessionCreateInput): UpUpAgentSpec {
  return {
    id: 'upup-stdio-session',
    version: '1.0.0',
    name: 'UpUp Pi Session',
    description: 'Persistent UpUp investment session powered by Pi.',
    ...(input.systemPrompt ? { systemPrompt: input.systemPrompt } : {}),
    ...(input.model ? { model: input.model } : {}),
    tools: input.tools?.length ? input.tools : '*',
    mode: 'primary',
    capabilities: ['financial-research', 'investment-analysis', 'session-resume'],
    taskTypes: ['research', 'invest', 'screen', 'risk'],
    permissions: {
      id: 'upup-stdio-readonly',
      allow: ['safe', 'warning'],
      requireApproval: ['dangerous', 'critical'],
      deny: [],
      allowExternalNetwork: true,
      allowCredentialAccess: false,
      allowFinancialWrites: false,
    },
    thinkingLevel: 'medium',
    dataPolicy: 'live',
    outputContract: 'report',
  };
}

async function findSessionFile(id: string, directory: string): Promise<string | undefined> {
  if (!existsSync(directory)) return undefined;
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await findSessionFile(id, path);
      if (nested) return nested;
      continue;
    }
    if (!entry.name.endsWith('.jsonl')) continue;
    const firstLine = (await readFile(path, 'utf8')).split('\n', 1)[0];
    try {
      const header = JSON.parse(firstLine) as { type?: string; id?: string };
      if (header.type === 'session' && header.id === id) return path;
    } catch {
      // Ignore unrelated or incomplete files.
    }
  }
  return undefined;
}

async function readSessionTags(path: string): Promise<string[] | undefined> {
  try {
    const entries = (await readFile(path, 'utf8')).split('\n');
    let metadata: Record<string, unknown> | undefined;
    for (const line of entries) {
      if (!line.trim()) continue;
      const entry = JSON.parse(line) as { type?: string; customType?: string; data?: unknown };
      if (entry.type !== 'custom' || entry.customType !== 'upup_session_metadata') continue;
      if (entry.data && typeof entry.data === 'object') metadata = entry.data as Record<string, unknown>;
    }
    const rawTags = metadata?.tags ?? metadata?.tag;
    if (Array.isArray(rawTags)) {
      const tags = rawTags.filter((tag): tag is string => typeof tag === 'string' && tag.length > 0);
      return tags.length > 0 ? tags : undefined;
    }
    return typeof rawTags === 'string' && rawTags.length > 0 ? [rawTags] : undefined;
  } catch {
    return undefined;
  }
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((part): part is { type: 'text'; text: string } =>
      typeof part === 'object' && part !== null && 'type' in part && part.type === 'text' && 'text' in part && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');
}

function toSerializedMessages(session: UpUpAgentSession): Array<{ type: string; content: string; additional_kwargs?: Record<string, unknown> }> {
  return session.getMessages().flatMap((message) => {
    if (!message || typeof message !== 'object' || !('role' in message)) return [];
    const value = message as { role: string; content?: unknown };
    return [{ type: value.role, content: textFromContent(value.content) }];
  });
}

async function createRecord(input: PiSessionCreateInput): Promise<PiSessionRecord> {
  const cwd = resolve(input.cwd ?? process.cwd());
  const directory = sessionDirectory(cwd);
  const existingPath = input.id ? await findSessionFile(input.id, directory) : undefined;
  const session = await runtime.createSession(specFor(input), {
    cwd,
    sessionDir: directory,
    ...(existingPath ? { sessionPath: existingPath } : {}),
    ...(input.id && !existingPath ? { sessionId: input.id } : {}),
  });
  const now = Date.now();
  const persistedMetadata = [...session.getCustomEntries('upup_session_metadata')].at(-1);
  const metadata = {
    ...((persistedMetadata && typeof persistedMetadata === 'object' && 'data' in persistedMetadata && persistedMetadata.data && typeof persistedMetadata.data === 'object')
      ? persistedMetadata.data as Record<string, unknown>
      : {}),
    ...(input.firstPrompt ? { firstPrompt: input.firstPrompt } : {}),
    ...(input.metadata ?? {}),
  };
  if (!persistedMetadata && Object.keys(metadata).length > 0) {
    session.appendEntry('upup_session_metadata', metadata);
  }
  const summary: PiSessionSummary = {
    id: session.id,
    state: 'idle',
    createdAt: now,
    lastActivity: now,
    metadata,
  };
  const record = { session, summary, cwd, metadata };
  records.set(session.id, record);
  if (input.id && input.id !== session.id) records.set(input.id, record);
  return record;
}

export class PiSessionService {
  async create(input: PiSessionCreateInput = {}): Promise<PiSessionSummary> {
    const record = input.id ? records.get(input.id) : undefined;
    return (record ?? await createRecord(input)).summary;
  }

  async get(id: string): Promise<PiSessionSummary | null> {
    const record = records.get(id);
    if (record) {
      record.summary.lastActivity = Date.now();
      return record.summary;
    }
    const cwd = resolve(process.cwd());
    const existingPath = await findSessionFile(id, sessionDirectory(cwd));
    if (!existingPath) return null;
    return (await createRecord({ id, cwd })).summary;
  }

  async list(cwd = process.cwd()): Promise<SessionSummary[]> {
    const resolvedCwd = resolve(cwd);
    const directory = sessionDirectory(resolvedCwd);
    const sessions = await SessionManager.list(resolvedCwd, directory);
    return Promise.all(sessions.map(async (session) => {
      const tags = await readSessionTags(session.path);
      return {
        ...(tags ? { tags } : {}),
        id: session.id,
        title: session.name ?? (session.firstMessage.slice(0, 80) || session.id),
        modified: session.modified,
        created: session.created,
        firstPrompt: session.firstMessage || undefined,
        customTitle: session.name,
        projectPath: resolvedCwd,
        messageCount: session.messageCount,
        isSidechain: false,
      };
    }));
  }

  async getSessionFile(id: string, cwd = process.cwd()): Promise<string | undefined> {
    return records.get(id)?.session.getSessionFile() ?? findSessionFile(id, sessionDirectory(resolve(cwd)));
  }

  async updateMetadata(id: string, metadata: Record<string, unknown>): Promise<void> {
    const record = await this.resume(id);
    Object.assign(record.metadata, metadata);
    record.summary.metadata = record.metadata;
    record.session.appendEntry('upup_session_metadata', record.metadata);
  }

  async rename(id: string, title: string): Promise<void> {
    await this.updateMetadata(id, { customTitle: title });
    const record = await this.resume(id);
    record.session.appendSessionInfo(title);
  }

  async tag(id: string, tag: string | null): Promise<void> {
    await this.updateMetadata(id, { tag: tag ?? undefined });
  }

  async remove(id: string): Promise<boolean> {
    const record = records.get(id);
    const file = record?.session.getSessionFile() ?? await findSessionFile(id, sessionDirectory(process.cwd()));
    if (!file) return false;
    record?.session.dispose();
    for (const [key, value] of records) if (value === record) records.delete(key);
    await unlink(file).catch(() => undefined);
    return true;
  }

  async appendMetadata(id: string, metadata: Record<string, unknown>): Promise<void> {
    await this.updateMetadata(id, metadata);
  }

  async resume(id: string): Promise<PiSessionRecord> {
    const existing = records.get(id);
    const record = existing ?? await this.openExisting(id);
    record.summary.state = 'idle';
    record.summary.lastActivity = Date.now();
    return record;
  }

  private async openExisting(id: string): Promise<PiSessionRecord> {
    const cwd = resolve(process.cwd());
    const existingPath = await findSessionFile(id, sessionDirectory(cwd));
    if (!existingPath) throw new Error(`Pi session not found: ${id}`);
    return createRecord({ id, cwd });
  }

  async messages(id: string): Promise<Array<{ type: string; content: string; additional_kwargs?: Record<string, unknown> }>> {
    const current = records.get(id);
    if (current) {
      current.session.dispose();
      for (const [key, value] of records) if (value === current) records.delete(key);
    }
    const record = await this.openExisting(id);
    return toSerializedMessages(record.session);
  }

  async run(id: string, prompt: string, options: { model?: string; signal?: AbortSignal; onEvent?: (event: UpUpAgentEvent) => void }): Promise<string> {
    const record = await this.resume(id);
    record.summary.state = 'running';
    record.summary.lastActivity = Date.now();
    const unsubscribe = options.onEvent ? record.session.subscribe(options.onEvent) : undefined;
    try {
      await record.session.prompt(prompt, { signal: options.signal });
      await record.session.waitForIdle();
      record.summary.state = 'idle';
      return [...record.session.getMessages()].reverse().find((message) =>
        Boolean(message && typeof message === 'object' && 'role' in message && message.role === 'assistant'))
        ? textFromContent((([...record.session.getMessages()].reverse().find((message) => Boolean(message && typeof message === 'object' && 'role' in message && message.role === 'assistant')) as { content?: unknown }).content))
        : '';
    } catch (error) {
      record.summary.state = 'error';
      throw error;
    } finally {
      record.summary.lastActivity = Date.now();
      unsubscribe?.();
    }
  }

  async update(id: string, state?: PiSessionSummary['state'], metadata?: Record<string, unknown>): Promise<void> {
    const record = await this.resume(id);
    if (state) record.summary.state = state;
    if (metadata) {
      Object.assign(record.metadata, metadata);
      record.summary.metadata = record.metadata;
    }
    record.session.appendEntry('upup_session_lifecycle', {
      state: record.summary.state,
      metadata: record.summary.metadata,
      recordedAt: new Date().toISOString(),
    });
  }

  async end(id: string): Promise<void> {
    await this.update(id, 'completed');
  }

  async compact(id: string, instructions?: string): Promise<void> {
    const record = await this.resume(id);
    await record.session.compact(instructions);
  }

  async fork(id: string, entryId?: string): Promise<{ id: string; sessionFile?: string }> {
    const record = await this.resume(id);
    const sessionFile = record.session.fork(entryId);
    if (!sessionFile) throw new Error(`Pi session ${id} cannot be forked without persistence`);
    const firstLine = (await readFile(sessionFile, 'utf8')).split('\n', 1)[0];
    const header = JSON.parse(firstLine) as { id?: string };
    if (!header.id) throw new Error(`Forked Pi session has no session id: ${sessionFile}`);
    return { id: header.id, sessionFile };
  }

  async exportSession(id: string, format: 'jsonl' | 'html', outputPath?: string): Promise<string> {
    const record = await this.resume(id);
    return format === 'html'
      ? await record.session.exportToHtml(outputPath)
      : record.session.exportToJsonl(outputPath);
  }

  async dispose(): Promise<void> {
    for (const record of new Set(records.values())) record.session.dispose();
    records.clear();
  }
}

let service: PiSessionService | undefined;
export function getPiSessionService(): PiSessionService {
  service ??= new PiSessionService();
  return service;
}
