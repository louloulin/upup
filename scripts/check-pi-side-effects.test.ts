import { describe, expect, test } from 'bun:test';
import { findSideEffectCoverageGaps, REQUIRED_SIDE_EFFECTS, readWorkspaceManifests } from './check-pi-side-effects.ts';

describe('Pi side-effect manifest coverage', () => {
  test('covers every production side-effect requirement', () => {
    expect(REQUIRED_SIDE_EFFECTS.length).toBeGreaterThan(20);
    expect(findSideEffectCoverageGaps(readWorkspaceManifests())).toEqual([]);
  });

  test('detects an omitted declaration or drifted policy', () => {
    const manifest = { name: '@upup/pi-platform', pi: { tools: ['write_file'], sideEffects: [] } };
    expect(findSideEffectCoverageGaps([manifest])).toContain('@upup/pi-platform: missing sideEffects declaration for write_file');
  });
});
