/**
 * Session Storage Migration
 *
 * Migrates old session files (.json) to new JSONL format (.jsonl).
 * This script handles the transition from the deprecated session-persistence.ts
 * format to the new storage.ts format.
 *
 * Run: bun run src/session/migrate.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';

const UPUP_DIR = join(homedir(), '.upup');
const OLD_SESSIONS_DIR = join(UPUP_DIR, 'sessions');  // ~/.upup/sessions/
const NEW_SESSIONS_DIR = join(UPUP_DIR, 'data', 'sessions');  // ~/.upup/data/sessions/
const SESSION_FILE_PREFIX = 'session_';

interface OldSessionData {
  metadata: {
    id: string;
    createdAt: string;
    updatedAt: string;
    queryCount: number;
    totalIterations: number;
    totalTokens: number;
    model?: string;
    channel?: string;
  };
  transcript?: Array<{
    id: string;
    role: string;
    content: string;
    timestamp: string;
    toolName?: string;
    toolResult?: string;
  }>;
}

interface NewSessionData {
  metadata: {
    id: string;
    firstPrompt?: string;
    createdAt: number;
    modifiedAt: number;
    messageCount: number;
    projectPath: string;
    gitBranch?: string;
    resumeCount: number;
    customTitle?: string;
    tag?: string;
  };
  messages: Array<{
    id: string;
    type: string;
    content: string;
    timestamp: number;
    toolName?: string;
    toolResult?: string;
  }>;
}

/**
 * Convert old session format to new JSONL format
 */
function migrateOldSession(filePath: string, targetDir: string): { success: boolean; sessionId: string } {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const oldData: OldSessionData = JSON.parse(content);

    const sessionId = oldData.metadata.id.startsWith(SESSION_FILE_PREFIX)
      ? oldData.metadata.id.replace(SESSION_FILE_PREFIX, '')
      : oldData.metadata.id;

    // Convert to new format
    const messages = (oldData.transcript || [])
      .filter(msg => msg.content && msg.content.trim().length > 0)
      .map(msg => ({
        id: msg.id || randomUUID(),
        type: msg.role === 'user' ? 'user' : msg.role === 'assistant' ? 'assistant' : 'tool',
        content: msg.content,
        timestamp: typeof msg.timestamp === 'string' ? new Date(msg.timestamp).getTime() : msg.timestamp,
        toolName: msg.toolName,
        toolResult: msg.toolResult,
      }));

    const newData: NewSessionData = {
      metadata: {
        id: oldData.metadata.id,
        createdAt: typeof oldData.metadata.createdAt === 'string'
          ? new Date(oldData.metadata.createdAt).getTime()
          : oldData.metadata.createdAt,
        modifiedAt: typeof oldData.metadata.updatedAt === 'string'
          ? new Date(oldData.metadata.updatedAt).getTime()
          : oldData.metadata.updatedAt,
        messageCount: messages.length,
        projectPath: '',
        resumeCount: 0,
        customTitle: oldData.metadata.model ? `Model: ${oldData.metadata.model}` : undefined,
      },
      messages,
    };

    // Ensure target directory exists
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    // Write new format
    const newFilePath = join(targetDir, `${SESSION_FILE_PREFIX}${sessionId}.jsonl`);
    writeFileSync(newFilePath, JSON.stringify(newData) + '\n');

    return { success: true, sessionId: oldData.metadata.id };
  } catch (err) {
    console.error(`Failed to migrate ${filePath}:`, err);
    return { success: false, sessionId: '' };
  }
}

/**
 * List all old session files
 */
function listOldSessions(): string[] {
  if (!existsSync(OLD_SESSIONS_DIR)) {
    return [];
  }

  const files = readdirSync(OLD_SESSIONS_DIR)
    .filter(f => f.endsWith('.json') && f.startsWith('session_'));

  return files.map(f => join(OLD_SESSIONS_DIR, f));
}

/**
 * Run migration
 */
async function runMigration(): Promise<void> {
  console.log('======================================');
  console.log('  Session Storage Migration');
  console.log('======================================');
  console.log();

  console.log(`Old sessions dir: ${OLD_SESSIONS_DIR}`);
  console.log(`New sessions dir: ${NEW_SESSIONS_DIR}`);
  console.log();

  // Ensure new directory exists
  if (!existsSync(NEW_SESSIONS_DIR)) {
    mkdirSync(NEW_SESSIONS_DIR, { recursive: true });
  }

  // List old sessions
  const oldSessions = listOldSessions();
  console.log(`Found ${oldSessions.length} old session file(s)`);
  console.log();

  if (oldSessions.length === 0) {
    console.log('No old sessions to migrate. Nothing to do.');
    return;
  }

  // Migrate each session
  let successCount = 0;
  let failCount = 0;

  for (const filePath of oldSessions) {
    const fileName = filePath.split('/').pop()!;
    process.stdout.write(`Migrating ${fileName}... `);

    const result = migrateOldSession(filePath, NEW_SESSIONS_DIR);
    if (result.success) {
      console.log('✓');
      successCount++;
    } else {
      console.log('✗');
      failCount++;
    }
  }

  console.log();
  console.log('======================================');
  console.log(`  Migration complete!`);
  console.log(`  Success: ${successCount}`);
  console.log(`  Failed: ${failCount}`);
  console.log('======================================');
}

// Run migration
runMigration().catch(console.error);