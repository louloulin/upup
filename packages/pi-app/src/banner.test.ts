import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { printUpupBanner, printUpupBrandLine, renderUpupBanner } from './banner';

describe('UpUp banner', () => {
  it('renders block-character logo + version footer', () => {
    const rendered = renderUpupBanner({ version: '2026.6.12', mode: 'interactive' });
    expect(rendered).toContain('涨涨');
    expect(rendered).toContain('Chinese Investment Research Agent');
    expect(rendered).toContain('UpUp v2026.6.12');
    expect(rendered).toContain('Pi Runtime');
    expect(rendered).toContain('mode=interactive');
    expect(rendered).toContain('██╗   ██╗██████╗');
  });

  it('omits mode/model when not provided', () => {
    const rendered = renderUpupBanner({ version: '2026.6.12' });
    expect(rendered).toContain('UpUp v2026.6.12');
    expect(rendered).not.toContain('mode=');
    expect(rendered).not.toContain('model=');
  });

  it('includes model when provided', () => {
    const rendered = renderUpupBanner({ version: '1.0.0', model: 'MiniMax-M3' });
    expect(rendered).toContain('model=MiniMax-M3');
  });

  it('reads version from cwd package.json when no env var is set', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'upup-banner-'));
    try {
      writeFileSync(join(tmp, 'package.json'), JSON.stringify({ version: '9.9.9' }), 'utf8');
      const previousCwd = process.cwd();
      process.chdir(tmp);
      try {
        const rendered = renderUpupBanner();
        expect(rendered).toContain('UpUp v9.9.9');
      } finally {
        process.chdir(previousCwd);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('falls back to "dev" when package.json is missing', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'upup-banner-'));
    try {
      const previousCwd = process.cwd();
      process.chdir(tmp);
      try {
        const rendered = renderUpupBanner();
        expect(rendered).toContain('UpUp vdev');
      } finally {
        process.chdir(previousCwd);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('printUpupBanner writes to stderr without throwing', () => {
    const previousWrite = process.stderr.write.bind(process.stderr);
    const writes: string[] = [];
    (process.stderr as { write: (chunk: string | Uint8Array) => boolean }).write = (chunk) => {
      writes.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    };
    try {
      printUpupBanner({ version: '2.0.0' });
    } finally {
      process.stderr.write = previousWrite;
    }
    expect(writes.join('')).toContain('UpUp v2.0.0');
  });

  it('printUpupBrandLine writes one-line brand to stderr', () => {
    const previousWrite = process.stderr.write.bind(process.stderr);
    const writes: string[] = [];
    (process.stderr as { write: (chunk: string | Uint8Array) => boolean }).write = (chunk) => {
      writes.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    };
    try {
      printUpupBrandLine({ version: '3.0.0' });
    } finally {
      process.stderr.write = previousWrite;
    }
    expect(writes.join('')).toContain('UpUp v3.0.0');
    expect(writes.join('')).toContain('涨涨');
    expect(writes.join('')).not.toContain('\n ██╗');
  });
});
