import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getConfig, getConfigPaths, listConfig, loadConfig, loadFinalConfig, setConfig } from './src/index';

describe('pi-config core', () => {
  test('merges global, local, and fragment layers and writes a backup', async () => {
    const root = await mkdtemp(join(process.env.TMPDIR ?? '/tmp', 'pi-config-'));
    const paths = getConfigPaths(root);
    await mkdir(paths.fragmentsDir, { recursive: true });
    await writeFile(paths.globalFile, JSON.stringify({ modelId: 'base', memory: { enabled: false } }));
    await writeFile(paths.localFile, JSON.stringify({ memory: { enabled: true } }));
    await writeFile(join(paths.fragmentsDir, '20-research.json'), JSON.stringify({ provider: 'openai' }));
    expect(loadConfig(paths)).toEqual({ modelId: 'base', memory: { enabled: true }, provider: 'openai' });
    const changed = setConfig('memory.maxTokens', 1000, paths);
    expect(changed.oldValue).toBeUndefined();
    expect(JSON.parse(await readFile(paths.globalFile, 'utf8'))).toMatchObject({ memory: { maxTokens: 1000 } });
    expect(listConfig('memory', paths)).toEqual({ memory: { enabled: true, maxTokens: 1000 } });
    expect(getConfig('modelId', paths)).toContain('modelId = base');
  });

  test('applies environment overrides after layered files', async () => {
    const root = await mkdtemp(join(process.env.TMPDIR ?? '/tmp', 'pi-config-env-'));
    const paths = getConfigPaths(root);
    await mkdir(join(root, '.upup'), { recursive: true });
    await writeFile(paths.globalFile, JSON.stringify({ provider: 'file', debug: false }));
    expect(loadFinalConfig(paths, { UPUP_PROVIDER: 'env', UPUP_DEBUG: '1' })).toEqual({ provider: 'env', debug: true });
  });
});
