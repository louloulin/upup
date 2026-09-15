import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { platformMcpAuthClear, platformMcpAuthGet, platformMcpAuthSet, platformMcpListResources, platformMcpReadResource } from './mcp';

describe('pi-platform MCP', () => {
  test('stores and masks credentials without leaking secrets', async () => {
    const home = await mkdtemp('/tmp/upup-platform-mcp-'); const previous = process.env.UPUP_HOME; process.env.UPUP_HOME = home;
    try {
      await platformMcpAuthSet({ server_name: 'market', type: 'bearer', credential: 'super-secret-token', key_prefix: 'Bearer ' });
      const output = await platformMcpAuthGet({ server_name: 'market' });
      expect(output).toContain('supe****oken'); expect(output).not.toContain('super-secret-token');
      expect(JSON.parse(await readFile(join(home, 'mcp-auth', 'credentials.json'), 'utf8')).market.credential).toBe('super-secret-token');
      expect(await platformMcpAuthClear({ server_name: 'market' })).toContain('cleared');
      expect(await platformMcpAuthGet({ server_name: 'market' })).toContain('No authentication');
    } finally { if (previous === undefined) delete process.env.UPUP_HOME; else process.env.UPUP_HOME = previous; await rm(home, { recursive: true, force: true }); }
  });

  test('adapts resource listing and reading through injected host functions', async () => {
    const listed = await platformMcpListResources({}, async () => [{ server: 'fixture', resources: [{ uri: 'fixture://one', name: 'One', mimeType: 'text/plain' }] }]);
    expect(listed).toMatchObject({ servers: 1, totalResources: 1 });
    const read = await platformMcpReadResource({ uri: 'fixture://one' }, async (uri) => ({ server: 'fixture', uri, contents: [{ uri, text: 'evidence' }] }));
    expect(read.contents[0]?.text).toBe('evidence');
  });
});
