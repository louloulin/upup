import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const HEARTBEAT_JOB_NAME = 'Heartbeat';
const DEFAULT_CHECKLIST = '- Major index moves (S&P 500, NASDAQ, Dow) — alert if any move more than 2% in a session\n- Breaking financial news — major earnings surprises, Fed announcements, significant market events';
export const HEARTBEAT_OK_TOKEN = 'HEARTBEAT_OK';

export interface PlatformHeartbeatResult {
  readonly action: 'view' | 'update';
  readonly content?: string;
  readonly message?: string;
  readonly enabled?: boolean;
  readonly syncedJob?: boolean;
}

function globalRoot(): string {
  return process.env.UPUP_HOME?.trim() || join(process.env.HOME || homedir(), '.upup');
}

function heartbeatPath(): string {
  return process.env.UPUP_HEARTBEAT_PATH?.trim() || join(globalRoot(), 'HEARTBEAT.md');
}

function gatewayPath(): string {
  return process.env.UPUP_GATEWAY_CONFIG?.trim() || join(globalRoot(), 'gateway.json');
}

function cronPath(): string {
  return join(globalRoot(), 'cron', 'jobs.json');
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    await writeFile(temporary, content, 'utf8');
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

function isEmptyChecklist(content: string): boolean {
  return content.split('\n').every((line) => {
    const trimmed = line.trim();
    return !trimmed || /^#+(?:\s.*)?$/.test(trimmed) || /^[-*]\s*$/.test(trimmed);
  });
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  if (!existsSync(path)) return {};
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function heartbeatQuery(checklist: string): string {
  return `[HEARTBEAT CHECK]\n\nYou are running as a periodic heartbeat. Review the following checklist and check if anything noteworthy has happened that the user should know about.\n\n## Checklist\n${checklist}\n\n## Instructions\n- Use your tools to check each item on the checklist\n- If you find something noteworthy, write a concise alert message for the user\n- If nothing noteworthy is happening, respond with exactly: ${HEARTBEAT_OK_TOKEN}\n- Do NOT send a message just to say "everything is fine" — only message if there's something actionable or noteworthy\n- Keep alerts brief and focused — lead with the key finding\n- You may combine multiple findings into one message`;
}

async function ensureGatewayEnabled(): Promise<void> {
  const path = gatewayPath();
  const config = await readJson(path);
  const gateway = config.gateway && typeof config.gateway === 'object' && !Array.isArray(config.gateway) ? config.gateway as Record<string, unknown> : {};
  const heartbeat = gateway.heartbeat && typeof gateway.heartbeat === 'object' && !Array.isArray(gateway.heartbeat) ? gateway.heartbeat as Record<string, unknown> : {};
  gateway.heartbeat = { ...heartbeat, enabled: true, intervalMinutes: typeof heartbeat.intervalMinutes === 'number' ? heartbeat.intervalMinutes : 10, maxIterations: typeof heartbeat.maxIterations === 'number' ? heartbeat.maxIterations : 6 };
  config.gateway = gateway;
  await atomicWrite(path, JSON.stringify(config, null, 2));
}

async function syncCronJob(query: string | null): Promise<boolean> {
  const path = cronPath();
  const store = await readJson(path);
  const jobs = Array.isArray(store.jobs) ? store.jobs.filter((job): job is Record<string, unknown> => Boolean(job && typeof job === 'object' && !Array.isArray(job))) : [];
  const job = jobs.find((candidate) => candidate.name === HEARTBEAT_JOB_NAME);
  if (!job) return false;
  if (query === null) job.enabled = false;
  else {
    const payload = job.payload && typeof job.payload === 'object' && !Array.isArray(job.payload) ? job.payload as Record<string, unknown> : {};
    job.payload = { ...payload, message: query };
    job.enabled = true;
  }
  job.updatedAtMs = Date.now();
  await atomicWrite(path, JSON.stringify({ ...store, version: typeof store.version === 'number' ? store.version : 1, jobs }, null, 2));
  return true;
}

export async function platformHeartbeat(input: { action: 'view' | 'update'; content?: string }): Promise<PlatformHeartbeatResult> {
  const path = heartbeatPath();
  if (input.action === 'view') {
    if (!existsSync(path)) return { action: 'view', message: 'No heartbeat checklist configured yet. The heartbeat will use a default checklist (major index moves + breaking financial news). Use the update action to customize what gets checked.' };
    return { action: 'view', content: await readFile(path, 'utf8') };
  }
  if (input.content === undefined) return { action: 'update', message: 'Error: content is required for the update action.' };
  if (input.content.length > 200_000) throw new Error('heartbeat content exceeds 200000 characters');
  await atomicWrite(path, input.content);
  const hasItems = input.content.split('\n').some((line) => /^\s*-\s+\S/.test(line));
  const query = isEmptyChecklist(input.content) ? null : heartbeatQuery(input.content);
  if (hasItems) await ensureGatewayEnabled();
  const syncedJob = await syncCronJob(query);
  return { action: 'update', message: hasItems ? `Updated heartbeat checklist (${input.content.split('\n').filter((line) => line.trim().startsWith('-')).length} item${input.content.split('\n').filter((line) => line.trim().startsWith('-')).length === 1 ? '' : 's'}).` : 'Updated heartbeat checklist.', enabled: hasItems, syncedJob };
}

export { DEFAULT_CHECKLIST };
