import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { MEMORY_TYPES, type MemoryType } from './types.js';
import { buildTypedManifest, scanTypedMemoryFiles } from './scanner.js';
import { getUpupDir } from '@upup/utils';

const MEMORY_DIRNAME = 'memory';
const LEGACY_DIRNAME = 'legacy';
const DAILY_FILE_RE = /^\d{4}-\d{2}-\d{2}\.md$/;
const INDEX_HEADER = '# UpUp Memory Index';

export interface MigrationResult {
  migrated: Array<{ from: string; to: string; type: MemoryType }>;
  skipped: Array<{ file: string; reason: string }>;
  archived: string[];
  indexPath: string;
}

export function inferMemoryType(params: {
  filename: string;
  frontmatterType?: string;
  content: string;
}): MemoryType {
  const frontmatterType = params.frontmatterType;
  if (frontmatterType && MEMORY_TYPES.includes(frontmatterType as MemoryType)) {
    return frontmatterType as MemoryType;
  }

  const fileName = params.filename.toLowerCase();
  const body = params.content.toLowerCase();

  if (
    fileName.includes('preference') ||
    fileName.includes('profile') ||
    fileName.includes('role') ||
    /\b(prefers?|uses?|works? with|goal is|knowledge|background|user)\b/.test(body)
  ) {
    return 'user';
  }

  if (
    fileName.includes('feedback') ||
    fileName.includes('style') ||
    /\b(avoid|prefer|please|should|shouldn't|do not|don't|keep doing|correction)\b/.test(body)
  ) {
    return 'feedback';
  }

  if (
    fileName.includes('reference') ||
    fileName.includes('links') ||
    /https?:\/\//.test(body) ||
    /\b(linear|grafana|jira|notion|slack|docs?)\b/.test(body)
  ) {
    return 'reference';
  }

  return 'project';
}

function sanitizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\.md$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'legacy-memory';
}

function buildMigratedBody(body: string, description: string): string {
  const trimmed = body.trim();
  if (!trimmed) {
    return description;
  }
  return trimmed;
}

function buildTypedFileContent(params: {
  name: string;
  description: string;
  type: MemoryType;
  body: string;
}): string {
  return matter.stringify(buildMigratedBody(params.body, params.description), {
    name: params.name,
    description: params.description,
    type: params.type,
  });
}

async function rebuildMemoryIndex(baseDir: string): Promise<string> {
  const memoryDir = join(baseDir, MEMORY_DIRNAME);
  const indexPath = join(memoryDir, 'MEMORY.md');
  const memories = await scanTypedMemoryFiles({ baseDir });
  const manifest = buildTypedManifest(memories).trim();

  const lines = [
    '# UpUp Memory Index',
    '',
    '## Summary',
    `Last updated: ${new Date().toISOString()}`,
    '',
    manifest.length > 0 ? manifest : '## Memories\n',
    '',
  ];

  await writeFile(indexPath, lines.join('\n'), 'utf-8');
  return indexPath;
}

export async function migrateLegacyMemories(options: {
  baseDir?: string;
  dryRun?: boolean;
} = {}): Promise<MigrationResult> {
  const baseDir = options.baseDir ?? getUpupDir();
  const memoryDir = join(baseDir, MEMORY_DIRNAME);
  const archiveDir = join(memoryDir, LEGACY_DIRNAME);
  const result: MigrationResult = {
    migrated: [],
    skipped: [],
    archived: [],
    indexPath: join(memoryDir, 'MEMORY.md'),
  };

  if (!existsSync(memoryDir)) {
    return result;
  }

  const entries = await readdir(memoryDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) {
      continue;
    }

    const sourcePath = join(memoryDir, entry.name);
    const raw = await readFile(sourcePath, 'utf-8');

    if (entry.name === 'MEMORY.md' && raw.startsWith(INDEX_HEADER)) {
      result.skipped.push({ file: sourcePath, reason: 'Already a typed memory index' });
      continue;
    }

    const { data, content } = matter(raw);
    const inferredType = inferMemoryType({
      filename: entry.name,
      frontmatterType: typeof data.type === 'string' ? data.type : undefined,
      content,
    });

    const legacyBaseName = DAILY_FILE_RE.test(entry.name)
      ? `daily-${entry.name.replace(/\.md$/, '')}`
      : sanitizeName(typeof data.name === 'string' ? data.name : entry.name);
    const description = typeof data.description === 'string'
      ? data.description
      : content.split('\n').find(line => line.trim())?.trim().slice(0, 120) || legacyBaseName;

    const targetDir = join(memoryDir, inferredType);
    const targetPath = join(targetDir, `${legacyBaseName}.md`);
    const archivePath = join(archiveDir, entry.name === 'MEMORY.md' ? 'MEMORY.legacy.md' : entry.name);

    if (existsSync(targetPath)) {
      result.skipped.push({ file: sourcePath, reason: `Target already exists: ${targetPath}` });
      continue;
    }

    result.migrated.push({ from: sourcePath, to: targetPath, type: inferredType });
    result.archived.push(archivePath);

    if (options.dryRun) {
      continue;
    }

    await mkdir(targetDir, { recursive: true });
    await mkdir(archiveDir, { recursive: true });
    await writeFile(targetPath, buildTypedFileContent({
      name: legacyBaseName,
      description,
      type: inferredType,
      body: content,
    }), 'utf-8');
    await rename(sourcePath, archivePath);
  }

  if (!options.dryRun) {
    result.indexPath = await rebuildMemoryIndex(baseDir);
  }

  return result;
}
