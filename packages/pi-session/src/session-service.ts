import { existsSync } from 'node:fs';
import { readdir, readFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { SessionManager } from '@earendil-works/pi-coding-agent';

import type { UpUpAgentEvent, UpUpAgentRuntime, UpUpAgentSession, UpUpAgentSpec, UpUpCreateSessionOptions } from '@upup/pi-runtime';
import { PiSessionRegistry } from './session-registry';
import { withPiFileLock } from './file-lock';


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

export interface PiSessionListItem {
  id: string;
  title: string;
  modified: Date;
  created: Date;
  firstPrompt?: string;
  customTitle?: string;
  tag?: string;
  projectPath: string;
  gitBranch?: string;
  messageCount: number;
  tags?: string[];
  isSidechain?: boolean;
}

interface PiSessionRecord {
  session: UpUpAgentSession;
  summary: PiSessionSummary;
  cwd: string;
  metadata: Record<string, unknown>;
}

function sessionDirectory(cwd: string, configuredDirectory?: string): string {
  return resolve(configuredDirectory ?? join(cwd, '.upup', 'sessions'));
}

function sessionLockPath(directory: string, id: string): string {
  return join(directory, `.${id}.pi-lock`);
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

async function createRecord(
  input: PiSessionCreateInput,
  runtime: UpUpAgentRuntime,
  records: Map<string, PiSessionRecord>,
  directory: string,
): Promise<PiSessionRecord> {
  const cwd = resolve(input.cwd ?? process.cwd());
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
    createdAt: createdAtFromSession(session, now),
    lastActivity: now,
    metadata,
  };
  const record = { session, summary, cwd, metadata };
  records.set(session.id, record);
  if (input.id && input.id !== session.id) records.set(input.id, record);
  return record;
}

function createdAtFromSession(session: UpUpAgentSession, fallback: number): number {
  const timestamp = session.getSessionHeader()?.timestamp;
  if (!timestamp) return fallback;
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export interface PiSessionServiceOptions {
  runtime: UpUpAgentRuntime;
  sessionDirectory?: string;
}

export class PiSessionService {
  private readonly runtime: UpUpAgentRuntime;
  private readonly records = new Map<string, PiSessionRecord>();
  private readonly recordInitializations = new Map<string, Promise<PiSessionRecord>>();
  private readonly runnerRegistry = new PiSessionRegistry();
  private readonly configuredSessionDirectory: string | undefined;
  private disposed = false;

  constructor(options: PiSessionServiceOptions) {
    this.runtime = options.runtime;
    this.configuredSessionDirectory = options.sessionDirectory ?? process.env.UPUP_SESSION_DIR;
  }

  private directory(cwd: string): string {
    return sessionDirectory(cwd, this.configuredSessionDirectory);
  }

  private withSessionLock<T>(id: string, cwd: string, operation: () => Promise<T>): Promise<T> {
    return withPiFileLock(sessionLockPath(this.directory(cwd), id), operation);
  }

  private createRecordWithLock(input: PiSessionCreateInput, cwd: string): Promise<PiSessionRecord> {
    const directory = this.directory(cwd);
    const key = input.id ? `${directory}:${input.id}` : undefined;
    if (!key) return createRecord(input, this.runtime, this.records, directory);
    const existing = this.records.get(input.id!);
    if (existing) return Promise.resolve(existing);
    const pending = this.recordInitializations.get(key);
    if (pending) return pending;
    const initialization = this.withSessionLock(input.id!, cwd, () => this.createRecordOnce(input, cwd, true));
    this.recordInitializations.set(key, initialization);
    void initialization.then(() => undefined, () => undefined).finally(() => {
      if (this.recordInitializations.get(key) === initialization) this.recordInitializations.delete(key);
    });
    return initialization;
  }

  private ensureActive(): void {
    if (this.disposed) throw new Error('PiSessionService is disposed');
  }

  createRuntimeSession(spec: UpUpAgentSpec, options: UpUpCreateSessionOptions = {}): Promise<UpUpAgentSession> {
    this.ensureActive();
    return this.runtime.createSession(spec, options);
  }

  getRunnerRegistry(): PiSessionRegistry {
    this.ensureActive();
    return this.runnerRegistry;
  }

  private async createRecordOnce(input: PiSessionCreateInput, cwd: string, skipPending = false): Promise<PiSessionRecord> {
    const directory = this.directory(cwd);
    const key = input.id ? `${directory}:${input.id}` : undefined;
    if (!key) {
      const record = await createRecord(input, this.runtime, this.records, directory);
      if (this.disposed) {
        record.session.dispose();
        this.records.delete(record.session.id);
        throw new Error('PiSessionService is disposed');
      }
      return record;
    }
    const existing = this.records.get(input.id!);
    if (existing) return existing;
    if (skipPending) {
      const record = await createRecord(input, this.runtime, this.records, directory);
      if (this.disposed) {
        record.session.dispose();
        for (const [recordKey, value] of this.records) if (value === record) this.records.delete(recordKey);
        throw new Error('PiSessionService is disposed');
      }
      return record;
    }
    if (!skipPending) {
      const pending = this.recordInitializations.get(key);
      if (pending) return pending;
    }
    const initialization = createRecord(input, this.runtime, this.records, directory);
    this.recordInitializations.set(key, initialization);
    try {
      const record = await initialization;
      if (this.disposed) {
        record.session.dispose();
        for (const [recordKey, value] of this.records) if (value === record) this.records.delete(recordKey);
        throw new Error('PiSessionService is disposed');
      }
      return record;
    } finally {
      if (this.recordInitializations.get(key) === initialization) this.recordInitializations.delete(key);
    }
  }

  async create(input: PiSessionCreateInput = {}): Promise<PiSessionSummary> {
    this.ensureActive();
    const cwd = resolve(input.cwd ?? process.cwd());
    const record = input.id ? this.records.get(input.id) : undefined;
    if (record || !input.id) return (record ?? await this.createRecordOnce(input, cwd)).summary;
    return (await this.createRecordWithLock(input, cwd)).summary;
  }

  async get(id: string): Promise<PiSessionSummary | null> {
    this.ensureActive();
    const record = this.records.get(id);
    if (record) {
      record.summary.lastActivity = Date.now();
      return record.summary;
    }
    const cwd = resolve(process.cwd());
    const directory = this.directory(cwd);
    const pending = this.recordInitializations.get(`${directory}:${id}`);
    if (pending) return (await pending).summary;
    const existingPath = await findSessionFile(id, directory);
    if (!existingPath) return null;
    return (await this.createRecordWithLock({ id, cwd }, cwd)).summary;
  }

  async list(cwd = process.cwd()): Promise<PiSessionListItem[]> {
    this.ensureActive();
    const resolvedCwd = resolve(cwd);
    const directory = this.directory(resolvedCwd);
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

  async getSessionFile(id: string, cwd = process.cwd(), sessionDirectoryOverride?: string): Promise<string | undefined> {
    this.ensureActive();
    return this.records.get(id)?.session.getSessionFile() ?? findSessionFile(id, sessionDirectory(resolve(cwd), sessionDirectoryOverride ?? this.configuredSessionDirectory));
  }

  async updateMetadata(id: string, metadata: Record<string, unknown>): Promise<void> {
    this.ensureActive();
    await this.withSessionLock(id, process.cwd(), async () => {
      const record = await this.resumeRecord(id);
      Object.assign(record.metadata, metadata);
      record.summary.metadata = record.metadata;
      record.session.appendEntry('upup_session_metadata', record.metadata);
    });
  }

  async rename(id: string, title: string): Promise<void> {
    await this.updateMetadata(id, { customTitle: title });
    await this.withSessionLock(id, process.cwd(), async () => {
      const record = await this.resumeRecord(id);
      record.session.appendSessionInfo(title);
    });
  }

  async tag(id: string, tag: string | null): Promise<void> {
    await this.updateMetadata(id, { tag: tag ?? undefined });
  }

  async remove(id: string): Promise<boolean> {
    this.ensureActive();
    return this.withSessionLock(id, process.cwd(), async () => {
      const record = this.records.get(id);
      const file = record?.session.getSessionFile() ?? await findSessionFile(id, this.directory(process.cwd()));
      if (!file) return false;
      record?.session.dispose();
      for (const [key, value] of this.records) if (value === record) this.records.delete(key);
      await unlink(file).catch(() => undefined);
      return true;
    });
  }

  async appendMetadata(id: string, metadata: Record<string, unknown>): Promise<void> {
    await this.updateMetadata(id, metadata);
  }

  async resume(id: string): Promise<PiSessionRecord> {
    this.ensureActive();
    const pending = this.recordInitializations.get(`${this.directory(process.cwd())}:${id}`);
    if (pending) return pending;
    return this.withSessionLock(id, process.cwd(), () => this.resumeRecord(id));
  }

  private async resumeRecord(id: string): Promise<PiSessionRecord> {
    const existing = this.records.get(id);
    const record = existing ?? await this.openExisting(id);
    record.summary.state = 'idle';
    record.summary.lastActivity = Date.now();
    return record;
  }

  private async openExisting(id: string): Promise<PiSessionRecord> {
    const cwd = resolve(process.cwd());
    const directory = this.directory(cwd);
    const pending = this.recordInitializations.get(`${directory}:${id}`);
    if (pending) return pending;
    const existingPath = await findSessionFile(id, directory);
    if (!existingPath) throw new Error(`Pi session not found: ${id}`);
    return this.createRecordOnce({ id, cwd }, cwd);
  }

  async messages(id: string): Promise<Array<{ type: string; content: string; additional_kwargs?: Record<string, unknown> }>> {
    this.ensureActive();
    const current = this.records.get(id);
    if (current) {
      current.session.dispose();
      for (const [key, value] of this.records) if (value === current) this.records.delete(key);
    }
    return this.withSessionLock(id, process.cwd(), async () => {
      const record = await this.openExisting(id);
      return toSerializedMessages(record.session);
    });
  }

  async run(id: string, prompt: string, options: { model?: string; signal?: AbortSignal; onEvent?: (event: UpUpAgentEvent) => void }): Promise<string> {
    this.ensureActive();
    return this.withSessionLock(id, process.cwd(), async () => {
      const record = await this.resumeRecord(id);
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
    });
  }

  async update(id: string, state?: PiSessionSummary['state'], metadata?: Record<string, unknown>): Promise<void> {
    this.ensureActive();
    await this.withSessionLock(id, process.cwd(), async () => {
      const record = await this.resumeRecord(id);
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
    });
  }

  async end(id: string): Promise<void> {
    await this.update(id, 'completed');
  }

  async compact(id: string, instructions?: string): Promise<void> {
    this.ensureActive();
    await this.withSessionLock(id, process.cwd(), async () => {
      const record = await this.resumeRecord(id);
      await record.session.compact(instructions);
    });
  }

  async fork(id: string, entryId?: string): Promise<{ id: string; sessionFile?: string }> {
    this.ensureActive();
    return this.withSessionLock(id, process.cwd(), async () => {
      const record = await this.resumeRecord(id);
      const sessionFile = record.session.fork(entryId);
      if (!sessionFile) throw new Error(`Pi session ${id} cannot be forked without persistence`);
      const firstLine = (await readFile(sessionFile, 'utf8')).split('\n', 1)[0];
      const header = JSON.parse(firstLine) as { id?: string };
      if (!header.id) throw new Error(`Forked Pi session has no session id: ${sessionFile}`);
      return { id: header.id, sessionFile };
    });
  }

  async exportSession(id: string, format: 'jsonl' | 'html', outputPath?: string): Promise<string> {
    this.ensureActive();
    return this.withSessionLock(id, process.cwd(), async () => {
      const record = await this.resumeRecord(id);
      return format === 'html'
        ? await record.session.exportToHtml(outputPath)
        : record.session.exportToJsonl(outputPath);
    });
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.runnerRegistry.dispose();
    for (const record of new Set(this.records.values())) record.session.dispose();
    this.records.clear();
    this.recordInitializations.clear();
  }

  disposeRunnerSessions(): void { this.runnerRegistry.dispose(); }
}

let service: PiSessionService | undefined;
export interface PiSessionServiceFactory {
  (): UpUpAgentRuntime;
}

let runtimeFactory: PiSessionServiceFactory | undefined;

export function configurePiSessionService(factory: PiSessionServiceFactory): void {
  void service?.dispose();
  runtimeFactory = factory;
  service = undefined;
}

export async function disposePiSessionService(): Promise<void> {
  const current = service;
  service = undefined;
  runtimeFactory = undefined;
  await current?.dispose();
}

export function getPiSessionService(): PiSessionService {
  if (!service) {
    if (!runtimeFactory) {
      throw new Error('PiSessionService is not configured: call configurePiSessionService() with a runtime factory before getPiSessionService()');
    }
    service = new PiSessionService({ runtime: runtimeFactory() });
  }
  return service;
}

export function isPiSessionServiceConfigured(): boolean {
  return runtimeFactory !== undefined;
}
