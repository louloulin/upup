import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { rebrandSystemPrompt, UPUP_IDENTITY_SENTENCE } from '@upup/pi-runtime';

/**
 * Brand drift guard.
 *
 * `@upup/pi-runtime/brand-extension` rewrites Pi's system prompt by matching
 * literal anchors (`You are an expert coding assistant operating inside pi, a
 * coding agent harness.`). Pi owns that template, so a Pi upgrade that rewords
 * the anchor would silently restore Pi's identity in every UpUp session —
 * `brand-extension.test.ts` cannot catch that, because it asserts against a
 * hand-copied fixture that would drift with it.
 *
 * This test reads the *installed* Pi template from `node_modules` and renders
 * it, so it fails the moment the anchor stops matching the shipped Pi build.
 */

const SYSTEM_PROMPT_JS = 'node_modules/@earendil-works/pi-coding-agent/dist/core/system-prompt.js';
const PI_IDENTITY = 'operating inside pi, a coding agent harness';

/** Render Pi's default template with representative substitutions. */
function readInstalledPiPrompt(): string {
  const source = readFileSync(SYSTEM_PROMPT_JS, 'utf8');
  const start = source.indexOf('let prompt = `');
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('`;', start);
  expect(end).toBeGreaterThan(start);
  return source
    .slice(start + 'let prompt = `'.length, end)
    .replace(/\$\{toolsList\}/g, '- read: Read a file')
    .replace(/\$\{guidelines\}/g, '- Be concise in your responses')
    .replace(/\$\{readmePath\}/g, '/pi/README.md')
    .replace(/\$\{docsPath\}/g, '/pi/docs')
    .replace(/\$\{examplesPath\}/g, '/pi/examples')
    // Pi appends the cwd after the template literal (`prompt += \nCurrent
    // working directory: ${promptCwd}`), so mirror that here.
    .concat('\nCurrent working directory: /repo');
}

describe('UpUp brand anchors against the installed Pi prompt template', () => {
  test('the installed Pi template still contains the identity anchor', () => {
    expect(readInstalledPiPrompt()).toContain(PI_IDENTITY);
  });

  test('rebranding the installed template yields the UpUp identity', () => {
    const rendered = readInstalledPiPrompt();
    const branded = rebrandSystemPrompt(rendered);
    expect(branded).not.toBe(rendered);
    expect(branded).toContain(UPUP_IDENTITY_SENTENCE);
    expect(branded).not.toContain(PI_IDENTITY);
  });

  test('every Pi guideline, doc path and cwd survives the rewrite verbatim', () => {
    const branded = rebrandSystemPrompt(readInstalledPiPrompt());
    for (const preserved of [
      'Available tools:',
      '- read: Read a file',
      'Guidelines:',
      '- Be concise in your responses',
      '/pi/docs',
      '/pi/examples',
      'Current working directory: /repo',
    ]) {
      expect(branded).toContain(preserved);
    }
  });

  test('rebranding is idempotent', () => {
    const once = rebrandSystemPrompt(readInstalledPiPrompt());
    expect(rebrandSystemPrompt(once)).toBe(once);
  });
});
