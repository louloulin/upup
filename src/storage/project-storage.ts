/**
 * Project Storage System
 *
 * Implements project-based session storage:
 * - Sessions grouped by project (sanitized cwd)
 * - Session transcripts stored as JSONL
 * - Write queues for batched writes
 * - Session metadata (titles, tags)
 * - Subagent transcript support
 *
 * Reference: Claude Code's src/utils/sessionStorage.ts
 */

import { globalUpupPath } from '../utils/storage-paths.js';
import { getCacheTTL } from './storage-adapter.js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Constants
// ============================================================================

/**
 * Flush interval for write queue (ms)
 */
const FLUSH_INTERVAL_MS = 100;

/**
 * Maximum chunk size for batch writes (100KB)
 */
const MAX_CHUNK_BYTES = 100 * 1024;

// ============================================================================
// Types
// ============================================================================

/**
 * Project info
 */
export interface ProjectInfo {
  /** Sanitized project path */
  path: string;
  /** Display name */
  name: string;
  /** Session count */
  sessionCount: number;
  /** Last accessed timestamp */
  lastAccessed: number;
  /** Created timestamp */
  createdAt: number;
}

/**
 * Session info for a project
 */
export interface SessionInfo {
  /** Session ID */
  id: string;
  /** Project path */
  projectPath: string;
  /** Transcript path */
  transcriptPath: string;
  /** Created timestamp */
  createdAt: number;
  /** Last accessed timestamp */
  lastAccessed: number;
  /** Message count */
  messageCount: number;
}

/**
 * Session data
 */
export interface SessionData {
  sessionId: string;
  createdAt: number;
  endedAt?: number;
  messages: SessionMessage[];
}

/**
 * Session message
 */
export interface SessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

/**
 * Session metadata
 */
export interface SessionMetadata {
  sessionId: string;
  customTitle?: string;
  tag?: string;
  agentName?: string;
  agentColor?: string;
  mode?: string;
  firstPrompt?: string;
  summary?: string;
}

/**
 * Subagent transcript info
 */
export interface SubagentTranscript {
  agentId: string;
  agentType: string;
  path: string;
  messageCount: number;
}

/**
 * Content replacement record
 */
export interface ContentReplacement {
  /** Original content hash */
  originalHash: string;
  /** Replacement content hash */
  replacementHash: string;
  /** Original message ID */
  originalMessageId: string;
  /** Replacement message ID */
  replacementMessageId: string;
  /** Timestamp */
  timestamp: number;
}

/**
 * Context collapse snapshot
 */
export interface ContextCollapseSnapshot {
  /** Snapshot ID */
  id: string;
  /** Message ID before collapse */
  beforeMessageId: string;
  /** Message ID after collapse */
  afterMessageId: string;
  /** Number of messages collapsed */
  collapsedCount: number;
  /** Collapse reason */
  reason: 'token_limit' | 'manual' | 'auto';
  /** Timestamp */
  timestamp: number;
}

/**
 * PR Activity Subscription
 */
export interface PRActivitySubscription {
  /** PR number */
  prNumber: number;
  /** Repository name */
  repo: string;
  /** Subscription start time */
  subscribedAt: number;
}

/**
 * Tombstone record for deleted content (F24)
 */
export interface TombstoneRecord {
  /** Record ID */
  id: string;
  /** Session ID where deletion occurred */
  sessionId: string;
  /** Original message ID */
  messageId: string;
  /** Content hash before deletion */
  contentHash: string;
  /** Deletion timestamp */
  timestamp: number;
  /** Reason for deletion */
  reason: 'manual' | 'auto' | 'context_collapse';
}

/**
 * Attribution snapshot (F87)
 */
export interface AttributionSnapshot {
  /** Attribution ID */
  id: string;
  /** Source message ID */
  sourceMessageId: string;
  /** Attribution type */
  type: 'reference' | 'citation' | 'inspiration';
  /** Target content */
  targetContent: string;
  /** Confidence score */
  confidence: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Remote agent metadata (F)
 */
export interface RemoteAgentMetadata {
  /** Agent ID */
  agentId: string;
  /** Agent type */
  agentType: string;
  /** Remote session ID */
  remoteSessionId: string;
  /** Remote endpoint */
  endpoint: string;
  /** Created at */
  createdAt: number;
}

/**
 * Session message with parent chain
 */
export interface SessionMessageWithParent extends SessionMessage {
  /** Parent message ID for chain tracking */
  parentUuid?: string;
}

/**
 * Orphaned tool result
 */
export interface OrphanedToolResult {
  /** Result ID */
  id: string;
  /** Associated session ID */
  sessionId: string;
  /** Tool name */
  toolName: string;
  /** Tool input */
  toolInput: string;
  /** Created at */
  createdAt: number;
  /** Status */
  status: 'pending' | 'resolved' | 'orphaned';
}

/**
 * Write queue entry
 */
interface WriteEntry {
  entry: SessionMessage;
  resolve: () => void;
}

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Sanitize path for use as directory name
 */
export function sanitizePath(pathStr: string): string {
  return pathStr
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/__+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 200);
}

/**
 * Get projects directory
 */
export function getProjectsDir(): string {
  return globalUpupPath('projects');
}

/**
 * Get project directory for a path
 */
export function getProjectDir(projectPath: string): string {
  return path.join(getProjectsDir(), sanitizePath(projectPath));
}

/**
 * Get transcript path for a session
 */
export function getTranscriptPath(projectPath: string, sessionId: string): string {
  return path.join(getProjectDir(projectPath), sessionId + '.jsonl');
}

/**
 * Get subagent transcript path
 */
export function getAgentTranscriptPath(projectPath: string, sessionId: string, agentId: string): string {
  return path.join(getProjectDir(projectPath), sessionId, 'subagents', `agent-${agentId}.jsonl`);
}

/**
 * Get metadata path for a session
 */
export function getMetadataPath(projectPath: string, sessionId: string): string {
  return path.join(getProjectDir(projectPath), sessionId + '.meta.json');
}

/**
 * Get content replacements path
 */
export function getContentReplacementsPath(projectPath: string, sessionId: string): string {
  return path.join(getProjectDir(projectPath), sessionId, 'content-replacements.jsonl');
}

/**
 * Get context snapshots path
 */
export function getContextSnapshotsPath(projectPath: string, sessionId: string): string {
  return path.join(getProjectDir(projectPath), sessionId, 'context-snapshots.jsonl');
}

/**
 * Get tombstone records path (F24)
 */
export function getTombstonesPath(projectPath: string, sessionId: string): string {
  return path.join(getProjectDir(projectPath), sessionId, 'tombstones.jsonl');
}

/**
 * Get attribution snapshots path (F87)
 */
export function getAttributionPath(projectPath: string, sessionId: string): string {
  return path.join(getProjectDir(projectPath), sessionId, 'attribution.jsonl');
}

/**
 * Get all transcript paths in a project
 */
export function getProjectTranscriptPaths(projectPath: string): string[] {
  const projectDir = getProjectDir(projectPath);

  if (!fs.existsSync(projectDir)) {
    return [];
  }

  const files = fs.readdirSync(projectDir);
  return files
    .filter((f: string) => f.endsWith('.jsonl'))
    .map((f: string) => path.join(projectDir, f));
}

// ============================================================================
// Project Manager
// ============================================================================

/**
 * Project Storage Manager with write queue
 */
export class ProjectStorage {
  private projectCache: Map<string, ProjectInfo> = new Map();
  private lastRefresh: number = 0;
  private cacheTTL: number;

  // Write queue for batched writes
  private writeQueues: Map<string, WriteEntry[]> = new Map();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingWriteCount: number = 0;

  // Session metadata cache
  private metadataCache: Map<string, SessionMetadata> = new Map();

  // PR Activity subscriptions
  private prSubscriptions: Map<string, PRActivitySubscription> = new Map();

  // Subagent transcript subdirectory
  private agentTranscriptSubdir: string | null = null;

  // Orphaned tool results storage
  private orphanedToolResults: Map<string, OrphanedToolResult> = new Map();

  constructor() {
    this.cacheTTL = getCacheTTL();
  }

  /**
   * Refresh project list from filesystem
   */
  async refresh(): Promise<void> {
    const projectsDir = getProjectsDir();

    this.projectCache.clear();

    if (!fs.existsSync(projectsDir)) {
      return;
    }

    const entries = fs.readdirSync(projectsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const projectPath = entry.name;
      const projectDir = path.join(projectsDir, projectPath);

      // Count sessions
      const files = fs.readdirSync(projectDir).filter((f: string) => f.endsWith('.jsonl'));
      const stats = fs.statSync(projectDir);

      const projectInfo: ProjectInfo = {
        path: projectPath,
        name: this.desanitizeName(projectPath),
        sessionCount: files.length,
        createdAt: stats.birthtimeMs,
        lastAccessed: stats.mtimeMs,
      };

      this.projectCache.set(projectPath, projectInfo);
    }

    this.lastRefresh = Date.now();
  }

  /**
   * Convert sanitized path back to display name
   */
  private desanitizeName(pathStr: string): string {
    return pathStr.replace(/_/g, '/');
  }

  /**
   * Get all projects (with caching)
   */
  async getProjects(): Promise<ProjectInfo[]> {
    if (Date.now() - this.lastRefresh > this.cacheTTL) {
      await this.refresh();
    }
    return [...this.projectCache.values()];
  }

  /**
   * Get project by path
   */
  async getProject(projectPath: string): Promise<ProjectInfo | null> {
    if (Date.now() - this.lastRefresh > this.cacheTTL) {
      await this.refresh();
    }

    const sanitized = sanitizePath(projectPath);
    return this.projectCache.get(sanitized) ?? null;
  }

  /**
   * Check if project exists
   */
  async hasProject(projectPath: string): Promise<boolean> {
    const project = await this.getProject(projectPath);
    return project !== null;
  }

  /**
   * Get project session count
   */
  async getSessionCount(projectPath: string): Promise<number> {
    const project = await this.getProject(projectPath);
    return project?.sessionCount ?? 0;
  }

  /**
   * Get sessions for a project
   */
  async getProjectSessions(projectPath: string): Promise<SessionInfo[]> {
    const projectDir = getProjectDir(projectPath);

    if (!fs.existsSync(projectDir)) {
      return [];
    }

    const files = fs.readdirSync(projectDir).filter((f: string) => f.endsWith('.jsonl'));
    const sessions: SessionInfo[] = [];

    for (const file of files) {
      const sessionId = file.replace('.jsonl', '');
      const transcriptPath = path.join(projectDir, file);
      const stats = fs.statSync(transcriptPath);

      // Load metadata if available
      const metadata = await this.loadMetadata(projectPath, sessionId);

      sessions.push({
        id: sessionId,
        projectPath,
        transcriptPath,
        createdAt: stats.birthtimeMs,
        lastAccessed: stats.mtimeMs,
        messageCount: 0, // Would need to read file to count
      });
    }

    // Sort by last accessed
    sessions.sort((a, b) => b.lastAccessed - a.lastAccessed);

    return sessions;
  }

  /**
   * Get all sessions across all projects
   */
  async getAllSessions(): Promise<SessionInfo[]> {
    const projects = await this.getProjects();
    const allSessions: SessionInfo[] = [];

    for (const project of projects) {
      const sessions = await this.getProjectSessions(project.path);
      allSessions.push(...sessions);
    }

    // Sort by last accessed
    allSessions.sort((a, b) => b.lastAccessed - a.lastAccessed);

    return allSessions;
  }

  // ============================================================================
  // Progressive Loading (F25)
  // ============================================================================

  /**
   * Load all projects' message logs progressively (F25)
   * Yields results incrementally to handle large datasets
   */
  async *loadAllProjectsMessageLogsProgressive(
    options?: {
      maxMessagesPerSession?: number;
      onProgress?: (current: number, total: number) => void;
    }
  ): AsyncGenerator<{ projectPath: string; sessionId: string; messages: SessionMessage[] }> {
    const projects = await this.getProjects();
    let processed = 0;

    for (const project of projects) {
      const sessions = await this.getProjectSessions(project.path);

      for (const session of sessions) {
        try {
          const data = await this.loadSessionTranscript(project.path, session.id);
          if (data && data.messages.length > 0) {
            const messages = options?.maxMessagesPerSession
              ? data.messages.slice(-options.maxMessagesPerSession)
              : data.messages;

            yield {
              projectPath: project.path,
              sessionId: session.id,
              messages,
            };
          }
        } catch {
          // Skip sessions that fail to load
        }

        processed++;
        options?.onProgress?.(processed, projects.length * sessions.length);
      }
    }
  }

  /**
   * Create project directory
   */
  ensureProject(projectPath: string): string {
    const projectDir = getProjectDir(projectPath);

    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    return projectDir;
  }

  // ============================================================================
  // Write Queue Methods
  // ============================================================================

  /**
   * Schedule flush if not already scheduled
   */
  private scheduleFlush(): void {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setTimeout(async () => {
      this.flushTimer = null;
      await this.drainWriteQueues();
    }, FLUSH_INTERVAL_MS);
  }

  /**
   * Drain all write queues
   */
  private async drainWriteQueues(): Promise<void> {
    for (const [transcriptPath, queue] of this.writeQueues) {
      if (queue.length === 0) {
        continue;
      }

      // Clear and get entries
      this.writeQueues.set(transcriptPath, []);
      let content = '';
      const resolvers: Array<() => void> = [];

      for (const { entry, resolve } of queue) {
        const line = JSON.stringify(entry) + '\n';

        // Check chunk size limit
        if (content.length + line.length >= MAX_CHUNK_BYTES) {
          // Flush current chunk
          await this.appendToFile(transcriptPath, content);
          for (const r of resolvers) {
            r();
          }
          resolvers.length = 0;
          content = '';
        }

        content += line;
        resolvers.push(resolve);
      }

      // Flush remaining
      if (content.length > 0) {
        await this.appendToFile(transcriptPath, content);
        for (const r of resolvers) {
          r();
        }
      }
    }
  }

  /**
   * Append content to file
   */
  private async appendToFile(filePath: string, content: string): Promise<void> {
    try {
      await fs.promises.appendFile(filePath, content, { mode: 0o600 });
    } catch {
      // Directory may not exist
      const dir = path.dirname(filePath);
      await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
      await fs.promises.appendFile(filePath, content, { mode: 0o600 });
    }
  }

  /**
   * Enqueue a write operation
   */
  private enqueueWrite(transcriptPath: string, entry: SessionMessage): Promise<void> {
    return new Promise<void>((resolve) => {
      let queue = this.writeQueues.get(transcriptPath);
      if (!queue) {
        queue = [];
        this.writeQueues.set(transcriptPath, queue);
      }
      queue.push({ entry, resolve });
      this.scheduleFlush();
    });
  }

  // ============================================================================
  // Session Transcripts
  // ============================================================================

  /**
   * Save session transcript (batched write)
   */
  async saveSessionTranscript(
    projectPath: string,
    sessionId: string,
    data: SessionData
  ): Promise<void> {
    const transcriptPath = getTranscriptPath(projectPath, sessionId);

    // Convert to JSONL and write
    const lines = data.messages.map((msg) => JSON.stringify(msg)).join('\n') + '\n';
    await this.appendToFile(transcriptPath, lines);
  }

  /**
   * Save single message (queued write)
   */
  async saveMessage(
    projectPath: string,
    sessionId: string,
    message: SessionMessage
  ): Promise<void> {
    const transcriptPath = getTranscriptPath(projectPath, sessionId);
    await this.enqueueWrite(transcriptPath, message);
  }

  /**
   * Load session transcript
   */
  async loadSessionTranscript(
    projectPath: string,
    sessionId: string
  ): Promise<SessionData | null> {
    const transcriptPath = getTranscriptPath(projectPath, sessionId);

    if (!fs.existsSync(transcriptPath)) {
      return null;
    }

    const content = fs.readFileSync(transcriptPath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim());

    const messages: SessionMessage[] = lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter((msg) => msg !== null) as SessionMessage[];

    const stats = fs.statSync(transcriptPath);

    return {
      sessionId,
      createdAt: stats.birthtimeMs,
      messages,
    };
  }

  // ============================================================================
  // Session Metadata
  // ============================================================================

  /**
   * Save session metadata
   */
  async saveMetadata(
    projectPath: string,
    sessionId: string,
    metadata: Partial<SessionMetadata>
  ): Promise<void> {
    const metadataPath = getMetadataPath(projectPath, sessionId);
    const dir = path.dirname(metadataPath);

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Load existing metadata
    let existing: SessionMetadata = {
      sessionId,
      ...this.metadataCache.get(sessionId),
    };

    // Merge with new metadata
    existing = { ...existing, ...metadata };

    // Update cache
    this.metadataCache.set(sessionId, existing);

    // Write to file
    fs.writeFileSync(metadataPath, JSON.stringify(existing, null, 2), 'utf-8');
  }

  /**
   * Load session metadata
   */
  async loadMetadata(
    projectPath: string,
    sessionId: string
  ): Promise<SessionMetadata | null> {
    const metadataPath = getMetadataPath(projectPath, sessionId);

    // Check cache first
    if (this.metadataCache.has(sessionId)) {
      return this.metadataCache.get(sessionId)!;
    }

    if (!fs.existsSync(metadataPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(metadataPath, 'utf-8');
      const metadata = JSON.parse(content) as SessionMetadata;
      this.metadataCache.set(sessionId, metadata);
      return metadata;
    } catch {
      return null;
    }
  }

  /**
   * Save custom session title
   */
  async saveCustomTitle(
    projectPath: string,
    sessionId: string,
    title: string
  ): Promise<void> {
    await this.saveMetadata(projectPath, sessionId, { customTitle: title });
  }

  /**
   * Get custom session title
   */
  async getCustomTitle(
    projectPath: string,
    sessionId: string
  ): Promise<string | null> {
    const metadata = await this.loadMetadata(projectPath, sessionId);
    return metadata?.customTitle ?? null;
  }

  /**
   * Save session tag
   */
  async saveTag(
    projectPath: string,
    sessionId: string,
    tag: string
  ): Promise<void> {
    await this.saveMetadata(projectPath, sessionId, { tag });
  }

  /**
   * Get session tag
   */
  async getTag(
    projectPath: string,
    sessionId: string
  ): Promise<string | null> {
    const metadata = await this.loadMetadata(projectPath, sessionId);
    return metadata?.tag ?? null;
  }

  /**
   * Save agent metadata
   */
  async saveAgentMetadata(
    projectPath: string,
    sessionId: string,
    agentName: string,
    agentColor?: string
  ): Promise<void> {
    await this.saveMetadata(projectPath, sessionId, { agentName, agentColor });
  }

  // ============================================================================
  // Subagent Transcripts
  // ============================================================================

  /**
   * Save subagent transcript
   */
  async saveAgentTranscript(
    projectPath: string,
    sessionId: string,
    agentId: string,
    data: SessionData
  ): Promise<void> {
    const transcriptPath = getAgentTranscriptPath(projectPath, sessionId, agentId);
    const dir = path.dirname(transcriptPath);

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Convert to JSONL and write
    const lines = data.messages.map((msg) => JSON.stringify(msg)).join('\n') + '\n';
    fs.writeFileSync(transcriptPath, lines, 'utf-8');
  }

  /**
   * Load subagent transcript
   */
  async loadAgentTranscript(
    projectPath: string,
    sessionId: string,
    agentId: string
  ): Promise<SessionData | null> {
    const transcriptPath = getAgentTranscriptPath(projectPath, sessionId, agentId);

    if (!fs.existsSync(transcriptPath)) {
      return null;
    }

    const content = fs.readFileSync(transcriptPath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim());

    const messages: SessionMessage[] = lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter((msg) => msg !== null) as SessionMessage[];

    return {
      sessionId: agentId,
      createdAt: 0,
      messages,
    };
  }

  /**
   * List subagent transcripts for a session
   */
  async listAgentTranscripts(
    projectPath: string,
    sessionId: string
  ): Promise<SubagentTranscript[]> {
    const subagentsDir = path.join(getProjectDir(projectPath), sessionId, 'subagents');

    if (!fs.existsSync(subagentsDir)) {
      return [];
    }

    const files = fs.readdirSync(subagentsDir).filter(
      (f: string) => f.startsWith('agent-') && f.endsWith('.jsonl')
    );

    return files.map((file: string) => {
      const agentId = file.replace('agent-', '').replace('.jsonl', '');
      const filePath = path.join(subagentsDir, file);
      const stats = fs.statSync(filePath);

      return {
        agentId,
        agentType: 'unknown',
        path: filePath,
        messageCount: 0,
      };
    });
  }

  // ============================================================================
  // Content Replacement
  // ============================================================================

  /**
   * Record a content replacement (for tracking edits to previous messages)
   */
  async recordContentReplacement(
    projectPath: string,
    sessionId: string,
    replacement: ContentReplacement
  ): Promise<void> {
    const filePath = getContentReplacementsPath(projectPath, sessionId);
    const dir = path.dirname(filePath);

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Append to file
    const line = JSON.stringify(replacement) + '\n';
    await fs.promises.appendFile(filePath, line, { mode: 0o600 });
  }

  /**
   * Get all content replacements for a session
   */
  async getContentReplacements(
    projectPath: string,
    sessionId: string
  ): Promise<ContentReplacement[]> {
    const filePath = getContentReplacementsPath(projectPath, sessionId);

    if (!fs.existsSync(filePath)) {
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim());

    return lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter((r) => r !== null) as ContentReplacement[];
  }

  // ============================================================================
  // Context Collapse Snapshots
  // ============================================================================

  /**
   * Record a context collapse snapshot
   */
  async recordContextCollapseSnapshot(
    projectPath: string,
    sessionId: string,
    snapshot: ContextCollapseSnapshot
  ): Promise<void> {
    const filePath = getContextSnapshotsPath(projectPath, sessionId);
    const dir = path.dirname(filePath);

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Append to file
    const line = JSON.stringify(snapshot) + '\n';
    await fs.promises.appendFile(filePath, line, { mode: 0o600 });
  }

  /**
   * Get all context collapse snapshots for a session
   */
  async getContextSnapshots(
    projectPath: string,
    sessionId: string
  ): Promise<ContextCollapseSnapshot[]> {
    const filePath = getContextSnapshotsPath(projectPath, sessionId);

    if (!fs.existsSync(filePath)) {
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim());

    return lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter((s) => s !== null) as ContextCollapseSnapshot[];
  }

  // ============================================================================
  // Tombstone Records (F24)
  // ============================================================================

  /**
   * Maximum bytes to rewrite in tombstone (F24)
   */
  private static readonly MAX_TOMBSTONE_REWRITE_BYTES = 100 * 1024;

  /**
   * Record a tombstone for deleted content (F24)
   */
  async recordTombstone(
    projectPath: string,
    sessionId: string,
    record: TombstoneRecord
  ): Promise<void> {
    const filePath = getTombstonesPath(projectPath, sessionId);
    const dir = path.dirname(filePath);

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Check file size limit
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.size > ProjectStorage.MAX_TOMBSTONE_REWRITE_BYTES) {
        // Prune old records to keep within limit
        await this.pruneTombstones(projectPath, sessionId);
      }
    }

    // Append to file
    const line = JSON.stringify(record) + '\n';
    await fs.promises.appendFile(filePath, line, { mode: 0o600 });
  }

  /**
   * Prune old tombstone records to stay within limit (F24)
   */
  private async pruneTombstones(projectPath: string, sessionId: string): Promise<void> {
    const filePath = getTombstonesPath(projectPath, sessionId);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim());

    // Keep only last half
    const pruned = lines.slice(Math.floor(lines.length / 2));
    fs.writeFileSync(filePath, pruned.join('\n') + '\n', 'utf-8');
  }

  /**
   * Get all tombstone records for a session (F24)
   */
  async getTombstones(projectPath: string, sessionId: string): Promise<TombstoneRecord[]> {
    const filePath = getTombstonesPath(projectPath, sessionId);

    if (!fs.existsSync(filePath)) {
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim());

    return lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter((r) => r !== null) as TombstoneRecord[];
  }

  // ============================================================================
  // Attribution Snapshots (F87)
  // ============================================================================

  /**
   * Record an attribution snapshot (F87)
   */
  async recordAttributionSnapshot(
    projectPath: string,
    sessionId: string,
    snapshot: AttributionSnapshot
  ): Promise<void> {
    const filePath = getAttributionPath(projectPath, sessionId);
    const dir = path.dirname(filePath);

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Append to file
    const line = JSON.stringify(snapshot) + '\n';
    await fs.promises.appendFile(filePath, line, { mode: 0o600 });
  }

  /**
   * Get all attribution snapshots for a session (F87)
   */
  async getAttributionSnapshots(
    projectPath: string,
    sessionId: string
  ): Promise<AttributionSnapshot[]> {
    const filePath = getAttributionPath(projectPath, sessionId);

    if (!fs.existsSync(filePath)) {
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim());

    return lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter((a) => a !== null) as AttributionSnapshot[];
  }

  // ============================================================================
  // Session Search (F26)
  // ============================================================================

  /**
   * Search sessions by custom title
   */
  async searchSessionsByCustomTitle(query: string): Promise<Array<{
    projectPath: string;
    sessionId: string;
    customTitle: string;
  }>> {
    const results: Array<{
      projectPath: string;
      sessionId: string;
      customTitle: string;
    }> = [];

    const projectsDir = getProjectsDir();
    if (!fs.existsSync(projectsDir)) {
      return results;
    }

    const projectEntries = fs.readdirSync(projectsDir, { withFileTypes: true });
    const lowerQuery = query.toLowerCase();

    for (const entry of projectEntries) {
      if (!entry.isDirectory()) continue;

      const projectPath = entry.name;
      const projectDir = path.join(projectsDir, projectPath);

      // Find all metadata files
      const metaFiles = fs.readdirSync(projectDir).filter(
        (f: string) => f.endsWith('.meta.json')
      );

      for (const metaFile of metaFiles) {
        const sessionId = metaFile.replace('.meta.json', '');
        const metaPath = path.join(projectDir, metaFile);

        try {
          const content = fs.readFileSync(metaPath, 'utf-8');
          const metadata = JSON.parse(content) as SessionMetadata;

          if (metadata.customTitle && metadata.customTitle.toLowerCase().includes(lowerQuery)) {
            results.push({
              projectPath,
              sessionId,
              customTitle: metadata.customTitle,
            });
          }
        } catch {
          // Skip invalid metadata files
        }
      }
    }

    return results;
  }

  // ============================================================================
  // PR Activity Subscription (F17)
  // ============================================================================

  /**
   * Link session to a PR
   */
  async linkSessionToPR(
    projectPath: string,
    sessionId: string,
    prNumber: number,
    repo: string
  ): Promise<void> {
    const subscription: PRActivitySubscription = {
      prNumber,
      repo,
      subscribedAt: Date.now(),
    };

    const key = `${projectPath}:${sessionId}`;
    this.prSubscriptions.set(key, subscription);

    // Persist to metadata file
    const metadata = await this.loadMetadata(projectPath, sessionId);
    if (metadata) {
      await this.saveMetadata(projectPath, sessionId, {
        ...metadata,
      });
    }
  }

  /**
   * Write PR activity subscription
   */
  async writePRActivitySubscription(
    projectPath: string,
    sessionId: string,
    prNumber: number,
    repo: string
  ): Promise<void> {
    await this.linkSessionToPR(projectPath, sessionId, prNumber, repo);
  }

  /**
   * Get PR subscription for a session
   */
  async getPRSubscription(
    projectPath: string,
    sessionId: string
  ): Promise<PRActivitySubscription | null> {
    const key = `${projectPath}:${sessionId}`;
    return this.prSubscriptions.get(key) ?? null;
  }

  // ============================================================================
  // Subagent Transcript Subdir (F)
  // ============================================================================

  /**
   * Set agent transcript subdirectory
   */
  setAgentTranscriptSubdir(subdir: string | null): void {
    this.agentTranscriptSubdir = subdir;
  }

  /**
   * Get agent transcript path with custom subdirectory
   */
  getAgentTranscriptPathWithSubdir(
    projectPath: string,
    sessionId: string,
    agentId: string
  ): string {
    const basePath = getAgentTranscriptPath(projectPath, sessionId, agentId);
    if (this.agentTranscriptSubdir) {
      const dir = path.dirname(basePath);
      return path.join(dir, this.agentTranscriptSubdir, path.basename(basePath));
    }
    return basePath;
  }

  // ============================================================================
  // Remote Agent Metadata (F)
  // ============================================================================

  /**
   * Write remote agent metadata
   */
  async writeRemoteAgentMetadata(
    projectPath: string,
    sessionId: string,
    metadata: RemoteAgentMetadata
  ): Promise<void> {
    const remoteDir = path.join(getProjectDir(projectPath), sessionId, 'remote-agents');
    if (!fs.existsSync(remoteDir)) {
      fs.mkdirSync(remoteDir, { recursive: true });
    }

    const filePath = path.join(remoteDir, `${metadata.agentId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2), 'utf-8');
  }

  /**
   * Read remote agent metadata
   */
  async readRemoteAgentMetadata(
    projectPath: string,
    sessionId: string,
    agentId: string
  ): Promise<RemoteAgentMetadata | null> {
    const filePath = path.join(getProjectDir(projectPath), sessionId, 'remote-agents', `${agentId}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as RemoteAgentMetadata;
    } catch {
      return null;
    }
  }

  // ============================================================================
  // Session Recovery - Message Chain (F)
  // ============================================================================

  /**
   * Save message with parent UUID chain
   */
  async saveMessageWithParent(
    projectPath: string,
    sessionId: string,
    message: SessionMessageWithParent
  ): Promise<void> {
    const transcriptPath = getTranscriptPath(projectPath, sessionId);
    await this.appendToFile(transcriptPath, JSON.stringify(message) + '\n');
  }

  /**
   * Build message chain from session
   */
  async buildMessageChain(
    projectPath: string,
    sessionId: string
  ): Promise<Map<string, SessionMessageWithParent>> {
    const data = await this.loadSessionTranscript(projectPath, sessionId);
    const chain = new Map<string, SessionMessageWithParent>();

    if (data) {
      for (const msg of data.messages) {
        chain.set(msg.id, msg as SessionMessageWithParent);
      }
    }

    return chain;
  }

  /**
   * Get message by ID from chain
   */
  getMessageFromChain(
    chain: Map<string, SessionMessageWithParent>,
    messageId: string
  ): SessionMessageWithParent | null {
    return chain.get(messageId) ?? null;
  }

  /**
   * Get parent message from chain
   */
  getParentMessage(
    chain: Map<string, SessionMessageWithParent>,
    messageId: string
  ): SessionMessageWithParent | null {
    const msg = chain.get(messageId);
    if (!msg || !msg.parentUuid) {
      return null;
    }
    return chain.get(msg.parentUuid) ?? null;
  }

  // ============================================================================
  // Orphaned Tool Results Recovery (F)
  // ============================================================================

  /**
   * Record orphaned tool result
   */
  recordOrphanedToolResult(result: OrphanedToolResult): void {
    this.orphanedToolResults.set(result.id, result);
  }

  /**
   * Recover orphaned parallel tool results
   */
  async recoverOrphanedParallelToolResults(
    sessionId: string
  ): Promise<OrphanedToolResult[]> {
    const results: OrphanedToolResult[] = [];

    for (const [id, result] of this.orphanedToolResults) {
      if (result.sessionId === sessionId && result.status === 'orphaned') {
        results.push(result);
        // Mark as pending for re-processing
        result.status = 'pending';
      }
    }

    return results;
  }

  /**
   * Resolve orphaned tool result
   */
  resolveOrphanedToolResult(resultId: string): void {
    const result = this.orphanedToolResults.get(resultId);
    if (result) {
      result.status = 'resolved';
    }
  }

  // ============================================================================
  // Hydrate Remote Session (F)
  // ============================================================================

  /**
   * Hydrate remote session data into local storage
   */
  async hydrateRemoteSession(
    projectPath: string,
    sessionId: string,
    remoteData: SessionData
  ): Promise<void> {
    const sessionDir = path.join(getProjectDir(projectPath), sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    // Save transcript
    const transcriptPath = getTranscriptPath(projectPath, sessionId);
    const lines = remoteData.messages.map((msg) => JSON.stringify(msg)).join('\n') + '\n';
    fs.writeFileSync(transcriptPath, lines, 'utf-8');

    // Save metadata
    const metadataPath = getMetadataPath(projectPath, sessionId);
    fs.writeFileSync(
      metadataPath,
      JSON.stringify({
        sessionId,
        createdAt: remoteData.createdAt,
        endedAt: remoteData.endedAt,
        messageCount: remoteData.messages.length,
      }, null, 2),
      'utf-8'
    );
  }

  // ============================================================================
  // Delete Operations
  // ============================================================================

  /**
   * Delete session
   */
  async deleteSession(projectPath: string, sessionId: string): Promise<boolean> {
    const transcriptPath = getTranscriptPath(projectPath, sessionId);
    const metadataPath = getMetadataPath(projectPath, sessionId);

    // Flush any pending writes for this session
    this.writeQueues.delete(transcriptPath);

    let deleted = false;

    if (fs.existsSync(transcriptPath)) {
      fs.unlinkSync(transcriptPath);
      deleted = true;
    }

    if (fs.existsSync(metadataPath)) {
      fs.unlinkSync(metadataPath);
    }

    // Delete session directory including subagents
    const sessionDir = path.join(getProjectDir(projectPath), sessionId);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true });
    }

    this.metadataCache.delete(sessionId);
    await this.refresh();
    return deleted;
  }

  /**
   * Delete project and all sessions
   */
  async deleteProject(projectPath: string): Promise<boolean> {
    const projectDir = getProjectDir(projectPath);

    // Clear all write queues
    this.writeQueues.clear();

    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true });
      await this.refresh();
      return true;
    }

    return false;
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Flush all pending writes
   */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.drainWriteQueues();
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<{
    totalProjects: number;
    totalSessions: number;
    oldestSession: number | null;
    newestSession: number | null;
    pendingWrites: number;
  }> {
    // Flush first
    await this.flush();

    const projects = await this.getProjects();
    const sessions = await this.getAllSessions();

    // Count pending writes
    let pendingWrites = 0;
    for (const queue of this.writeQueues.values()) {
      pendingWrites += queue.length;
    }

    const timestamps = sessions.map((s) => s.createdAt).filter((t) => t > 0);

    return {
      totalProjects: projects.length,
      totalSessions: sessions.length,
      oldestSession: timestamps.length > 0 ? Math.min(...timestamps) : null,
      newestSession: timestamps.length > 0 ? Math.max(...timestamps) : null,
      pendingWrites,
    };
  }
}

// ============================================================================
// Global Instance
// ============================================================================

let globalManager: ProjectStorage | null = null;

export function getProjectStorage(): ProjectStorage {
  if (!globalManager) {
    globalManager = new ProjectStorage();
  }
  return globalManager;
}

export function resetProjectStorage(): void {
  if (globalManager) {
    globalManager.flush().catch(() => {});
    globalManager = null;
  }
}
