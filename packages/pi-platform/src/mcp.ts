import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export type PlatformMcpAuthType = 'api_key' | 'bearer' | 'basic' | 'oauth2' | 'none';
export interface PlatformMcpAuth { serverName: string; type: PlatformMcpAuthType; headerName?: string; keyPrefix?: string; credential?: string; }
export interface PlatformMcpResource { uri: string; name?: string; description?: string; mimeType?: string; }
export interface PlatformMcpResourceGroup { server: string; resources: PlatformMcpResource[]; }
export interface PlatformMcpResourceContent { uri?: string; mimeType?: string; text?: string; blob?: string; }
export interface PlatformMcpResourceRead { server: string; uri: string; contents: PlatformMcpResourceContent[]; }

function authPath(): string { return join(process.env.UPUP_HOME?.trim() || join(process.env.HOME || homedir(), '.upup'), 'mcp-auth', 'credentials.json'); }
async function loadAuth(): Promise<Record<string, PlatformMcpAuth>> { const file = authPath(); if (!existsSync(file)) return {}; try { const parsed: unknown = JSON.parse(await readFile(file, 'utf8')); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, PlatformMcpAuth> : {}; } catch { return {}; } }
async function saveAuth(value: Record<string, PlatformMcpAuth>): Promise<void> { const file = authPath(); await mkdir(dirname(file), { recursive: true }); const temporary = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`; try { await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); await rename(temporary, file); } catch (error) { await unlink(temporary).catch(() => undefined); throw error; } }
function mask(value: string): string { return value.length <= 8 ? '****' : `${value.slice(0, 4)}****${value.slice(-4)}`; }
function formatAuth(auth: PlatformMcpAuth): string { return [`Server: ${auth.serverName}`, `  Type: ${auth.type}`, ...(auth.headerName ? [`  Header: ${auth.headerName}`] : []), ...(auth.keyPrefix ? [`  Prefix: ${auth.keyPrefix}`] : []), ...(auth.credential ? [`  Credential: ${mask(auth.credential)}`] : [])].join('\n'); }

export async function platformMcpAuthSet(input: { server_name: string; type: PlatformMcpAuthType; credential?: string; header_name?: string; key_prefix?: string }): Promise<string> {
  const auth = await loadAuth();
  auth[input.server_name] = { serverName: input.server_name, type: input.type, ...(input.credential ? { credential: input.credential } : {}), ...(input.header_name ? { headerName: input.header_name } : {}), ...(input.key_prefix ? { keyPrefix: input.key_prefix } : {}) };
  await saveAuth(auth);
  return `Authentication configured for "${input.server_name}" (type: ${input.type}).`;
}

export async function platformMcpAuthGet(input: { server_name?: string }): Promise<string> {
  const auth = await loadAuth();
  if (input.server_name) return auth[input.server_name] ? formatAuth(auth[input.server_name]!) : `No authentication configured for "${input.server_name}".`;
  const entries = Object.values(auth);
  return entries.length ? `MCP Authentication:\n\n${entries.map(formatAuth).join('\n\n')}` : 'No MCP servers have authentication configured.';
}

export async function platformMcpAuthClear(input: { server_name: string }): Promise<string> {
  const auth = await loadAuth();
  if (!auth[input.server_name]) return `No authentication found for "${input.server_name}".`;
  delete auth[input.server_name]; await saveAuth(auth); return `Authentication cleared for "${input.server_name}".`;
}

export async function platformMcpListResources(input: { server?: string }, list: (server?: string) => Promise<readonly PlatformMcpResourceGroup[]>): Promise<unknown> {
  const results = await list(input.server);
  return results.length ? { servers: results.length, totalResources: results.reduce((sum, group) => sum + group.resources.length, 0), results } : { message: 'No MCP servers connected or no resources available.', servers: 0, totalResources: 0 };
}

export async function platformMcpReadResource(input: { uri: string; server?: string }, read: (uri: string, server?: string) => Promise<PlatformMcpResourceRead>): Promise<PlatformMcpResourceRead> {
  return read(input.uri, input.server);
}
