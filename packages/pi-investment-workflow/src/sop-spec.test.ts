import { describe, expect, test } from 'bun:test';
import {
  SopValidationError,
  validateAgentCatalogForSop,
  validateSopSpec,
  type SopSpec,
} from './sop-spec';

const KNOWN = new Set([
  'invest-explore',
  'invest-plan',
  'invest-risk',
  'invest-trade',
  'invest-review',
  'fundamental-analysis',
  'technical-analysis',
  'bull-agent',
  'bear-agent',
  'neutral-agent',
  'synthesizer-agent',
]);

const baseGraham: SopSpec = {
  id: 'graham',
  name: 'Graham Value Investing',
  description: 'Classic Graham value SOP',
  version: '1.0.0',
  phases: [
    { id: 'detect', agent: 'invest-explore', intent: 'collect balance-sheet evidence' },
    { id: 'plan', agent: 'invest-plan', intent: 'compute intrinsic value', requires: ['detect'] },
    { id: 'report', agent: 'invest-review', intent: 'write report', requires: ['plan'] },
  ],
};

describe('validateSopSpec', () => {
  test('accepts a valid linear SOP', () => {
    expect(() => validateSopSpec(baseGraham, KNOWN)).not.toThrow();
  });

  test('rejects bad id', () => {
    expect(() => validateSopSpec({ ...baseGraham, id: 'Bad Id!' }, KNOWN)).toThrow(SopValidationError);
  });

  test('rejects bad version', () => {
    expect(() => validateSopSpec({ ...baseGraham, version: '1.0' }, KNOWN)).toThrow(SopValidationError);
  });

  test('rejects empty phases', () => {
    expect(() => validateSopSpec({ ...baseGraham, phases: [] }, KNOWN)).toThrow(SopValidationError);
  });

  test('rejects unknown agent', () => {
    const bad: SopSpec = { ...baseGraham, phases: [{ id: 'd', agent: 'nope', intent: 'x' }] };
    expect(() => validateSopSpec(bad, KNOWN)).toThrow(SopValidationError);
  });

  test('rejects duplicate phase ids', () => {
    const bad: SopSpec = {
      ...baseGraham,
      phases: [
        { id: 'detect', agent: 'invest-explore', intent: 'a' },
        { id: 'detect', agent: 'invest-plan', intent: 'b' },
      ],
    };
    expect(() => validateSopSpec(bad, KNOWN)).toThrow(SopValidationError);
  });

  test('rejects cycle in requires graph', () => {
    const cyclic: SopSpec = {
      ...baseGraham,
      phases: [
        { id: 'a', agent: 'invest-explore', intent: 'a', requires: ['b'] },
        { id: 'b', agent: 'invest-plan', intent: 'b', requires: ['a'] },
      ],
    };
    expect(() => validateSopSpec(cyclic, KNOWN)).toThrow(SopValidationError);
  });

  test('accepts parallel group with reduce modes', () => {
    const sop: SopSpec = {
      ...baseGraham,
      parallelGroups: [
        {
          id: 'debate',
          agents: ['bull-agent', 'bear-agent'],
          synthesizer: 'synthesizer-agent',
          reduce: 'llm-arbiter',
        },
      ],
    };
    expect(() => validateSopSpec(sop, KNOWN)).not.toThrow();
  });

  test('rejects parallel group with unknown synthesizer', () => {
    const sop: SopSpec = {
      ...baseGraham,
      parallelGroups: [
        { id: 'd', agents: ['bull-agent'], synthesizer: 'unknown-synth', reduce: 'majority' },
      ],
    };
    expect(() => validateSopSpec(sop, KNOWN)).toThrow(SopValidationError);
  });

  test('weighted reduce requires weights', () => {
    const sop: SopSpec = {
      ...baseGraham,
      parallelGroups: [
        { id: 'd', agents: ['bull-agent', 'bear-agent'], synthesizer: 'synthesizer-agent', reduce: 'weighted' },
      ],
    };
    expect(() => validateSopSpec(sop, KNOWN)).toThrow(SopValidationError);
    const ok = {
      ...sop,
      parallelGroups: [
        {
          id: 'd',
          agents: ['bull-agent', 'bear-agent'],
          synthesizer: 'synthesizer-agent',
          reduce: 'weighted' as const,
          weights: { 'bull-agent': 0.5, 'bear-agent': 0.5 },
        },
      ],
    };
    expect(() => validateSopSpec(ok, KNOWN)).not.toThrow();
  });
});

describe('validateAgentCatalogForSop', () => {
  test('collects all agent ids', () => {
    const ids = validateAgentCatalogForSop([
      { id: 'a', version: '1.0.0', name: 'A', description: 'd', packages: [], skills: [], tools: [], permissions: { id: 'p', allow: [], requireApproval: [], deny: [], allowExternalNetwork: false, allowCredentialAccess: false, allowFinancialWrites: false } },
    ]);
    expect(ids.has('a')).toBe(true);
  });
});
