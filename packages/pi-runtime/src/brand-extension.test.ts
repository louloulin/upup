import { describe, expect, it } from 'bun:test';

import {
  createUpUpBrandExtension,
  rebrandSystemPrompt,
  UPUP_IDENTITY_SENTENCE,
} from './brand-extension';

const PI_DEFAULT_PROMPT = `You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.

Available tools:
- read: Read a file

Guidelines:
- Be concise in your responses

Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):
- Main documentation: /pi/README.md

- When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md)
- When working on pi topics, read the docs and examples, and follow .md cross-references before implementing
- Always read pi .md files completely and follow links to related docs

Current working directory: /repo`;

describe('rebrandSystemPrompt', () => {
  it('replaces Pi product identity with UpUp', () => {
    const branded = rebrandSystemPrompt(PI_DEFAULT_PROMPT);
    expect(branded).toContain(UPUP_IDENTITY_SENTENCE);
    expect(branded).not.toContain('operating inside pi, a coding agent harness');
  });

  it('preserves every Pi guideline, tool and path verbatim', () => {
    const branded = rebrandSystemPrompt(PI_DEFAULT_PROMPT);
    expect(branded).toContain('Available tools:');
    expect(branded).toContain('- read: Read a file');
    expect(branded).toContain('Guidelines:');
    expect(branded).toContain('- Be concise in your responses');
    expect(branded).toContain('- Main documentation: /pi/README.md');
    expect(branded).toContain('Current working directory: /repo');
    expect(branded).toContain('docs/extensions.md');
    expect(branded).toContain('docs/themes.md');
  });

  it('rebrands the documentation section header and pi-topic guidance', () => {
    const branded = rebrandSystemPrompt(PI_DEFAULT_PROMPT);
    expect(branded).toContain('Pi runtime documentation (read only when the user asks about the underlying Pi agent runtime');
    expect(branded).toContain('- When working on Pi runtime topics, read the docs and examples');
    expect(branded).toContain('- Always read Pi runtime .md files completely');
  });

  it('is idempotent', () => {
    const once = rebrandSystemPrompt(PI_DEFAULT_PROMPT);
    const twice = rebrandSystemPrompt(once);
    expect(twice).toBe(once);
  });

  it('passes through prompts that never mention Pi', () => {
    const custom = 'You are a helpful assistant. Current working directory: /x';
    expect(rebrandSystemPrompt(custom)).toBe(custom);
  });

  it('handles the capitalised Pi variant', () => {
    const branded = rebrandSystemPrompt('You are an expert coding assistant operating inside Pi, a coding agent harness.');
    expect(branded).toContain(UPUP_IDENTITY_SENTENCE);
  });

  it('returns empty input unchanged', () => {
    expect(rebrandSystemPrompt('')).toBe('');
  });
});

describe('createUpUpBrandExtension', () => {
  interface RecordedHandler {
    event: string;
    handler: (event: { systemPrompt: string }) => unknown;
  }

  function fakePi(): { on: (event: string, handler: (e: { systemPrompt: string }) => unknown) => void; recorded: RecordedHandler[] } {
    const recorded: RecordedHandler[] = [];
    return {
      recorded,
      on: (event, handler) => {
        recorded.push({ event, handler });
      },
    };
  }

  it('registers a single before_agent_start handler', () => {
    const pi = fakePi();
    createUpUpBrandExtension()(pi as never);
    expect(pi.recorded).toHaveLength(1);
    expect(pi.recorded[0]!.event).toBe('before_agent_start');
  });

  it('returns a rebranded systemPrompt from the handler', () => {
    const pi = fakePi();
    createUpUpBrandExtension()(pi as never);
    const result = pi.recorded[0]!.handler({ systemPrompt: PI_DEFAULT_PROMPT }) as { systemPrompt?: string };
    expect(result.systemPrompt).toContain(UPUP_IDENTITY_SENTENCE);
  });

  it('returns undefined (no-op) when the prompt is already UpUp-branded', () => {
    const pi = fakePi();
    createUpUpBrandExtension()(pi as never);
    const already = rebrandSystemPrompt(PI_DEFAULT_PROMPT);
    const result = pi.recorded[0]!.handler({ systemPrompt: already });
    expect(result).toBeUndefined();
  });
});
