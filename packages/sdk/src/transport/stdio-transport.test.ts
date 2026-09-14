import { describe, expect, test } from 'bun:test';
import { StdioTransport } from './stdio-transport.js';

describe('StdioTransport failure isolation', () => {
  test('turns a spawn error into a rejected connect promise', async () => {
    const transport = new StdioTransport({ executablePath: '/path/that/does/not/exist', args: ['--stdio'] });
    await expect(transport.connect()).rejects.toThrow(/Failed to initialize transport|ENOENT/);
    expect(transport.connected).toBe(false);
    await transport.close();
  });

  test('rejects initialization when the child exits before replying', async () => {
    const transport = new StdioTransport({ executablePath: process.execPath, args: ['-e', 'process.exit(7)'] });
    await expect(transport.connect()).rejects.toThrow(/process exited with code 7/);
    expect(transport.connected).toBe(false);
    await transport.close();
  });
});
