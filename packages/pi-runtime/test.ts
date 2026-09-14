import { describe, expect, test } from 'bun:test';
import {
  PI_CAPABILITIES_CONTRACT,
  PI_EVENTS_CONTRACT,
  createPiCapabilityContext,
  serializeAgentSpec,
  toCanonicalAgentEvent,
  validateAgentSpec,
  validatePiPackageManifest,
  type UpUpAgentSpec,
} from './src/index.js';

const spec: UpUpAgentSpec = {
  id: 'runtime-test', version: '1.0.0', name: 'Runtime test', description: 'Contract test', tools: ['quote'], mode: 'primary', capabilities: ['market-data'], taskTypes: ['research'],
  permissions: { id: 'read-only', allow: ['safe'], requireApproval: [], deny: ['dangerous', 'critical'], allowExternalNetwork: false, allowCredentialAccess: false, allowFinancialWrites: false },
};

describe('pi-runtime contracts', () => {
  test('validates and serializes agent specs', () => {
    validateAgentSpec(spec);
    expect(JSON.parse(serializeAgentSpec(spec)).id).toBe('runtime-test');
    expect(() => validateAgentSpec({ ...spec, id: 'Bad ID' })).toThrow('Invalid agent id');
  });
  test('preserves canonical event contract and event data', () => {
    const event = toCanonicalAgentEvent({ type: 'text_delta', sessionId: 's1', delta: 'hi' });
    expect(event).toEqual({ contract: PI_EVENTS_CONTRACT, type: 'text_delta', sessionId: 's1', delta: 'hi' });
  });
  test('fails closed for missing and mismatched capabilities', async () => {
    let disposed = 0;
    const context = createPiCapabilityContext({ sessionId: 's1', capabilities: { quote: { version: '1.0.0', value: { quote: true }, dispose: () => { disposed += 1; } } } });
    expect(context.contract).toBe(PI_CAPABILITIES_CONTRACT);
    expect(context.get('quote', '1.0.0')).toEqual({ quote: true });
    expect(() => context.get('missing')).toThrow('unavailable');
    expect(() => context.get('quote', '2.0.0')).toThrow('version mismatch');
    await context.dispose();
    expect(disposed).toBe(1);
    expect(() => context.get('quote')).toThrow('disposed');
  });
  test('validates package manifest resource uniqueness and versions', () => {
    validatePiPackageManifest({ name: '@upup/pi-runtime', version: '0.1.0', source: 'builtin:upup', resources: { extensions: ['./extensions'], skills: ['./skills'], prompts: ['./prompts'], workflows: ['./workflows'], policies: ['./policies'], evals: ['./evals'] } });
    expect(() => validatePiPackageManifest({ name: '@upup/pi-runtime', version: '0.1.0', source: '', resources: { extensions: [], skills: [], prompts: [], workflows: [], policies: [], evals: [] } })).toThrow('source');
  });
});
