import { describe, expect, test } from 'bun:test';
import { addPlatformSwarmAgent, addPlatformSwarmMessage, createInitialPlatformSwarmState, createPlatformSwarmTeam, parsePlatformSwarmState, updatePlatformSwarmAgent } from './swarm.js';

describe('Pi platform swarm state', () => {
  test('creates teams, tracks workers, messages, and lifecycle', () => {
    let state = createInitialPlatformSwarmState();
    state = createPlatformSwarmTeam(state, { name: 'research', description: 'Research team' }, 1, 'team-1');
    state = addPlatformSwarmAgent(state, { id: 'agent-1', teamName: 'research', name: 'Analyst', role: 'researcher' }, 2);
    state = addPlatformSwarmAgent(state, { id: 'agent-2', teamName: 'research', name: 'Reviewer', role: 'reviewer' }, 2);
    state = updatePlatformSwarmAgent(state, 'agent-1', { status: 'completed', result: 'evidence' }, 3);
    state = addPlatformSwarmMessage(state, { from: 'agent-1', to: 'agent-2', content: 'done', timestamp: 4 });
    expect(state.teams[0].members).toHaveLength(3);
    expect(state.agents[0]).toMatchObject({ status: 'completed', result: 'evidence' });
    expect(state.messages).toHaveLength(1);
  });

  test('rejects malformed state and messages for unknown workers', () => {
    expect(parsePlatformSwarmState({ schema: 99, teams: [{ malicious: true }] })).toEqual(createInitialPlatformSwarmState());
    const state = createInitialPlatformSwarmState();
    expect(addPlatformSwarmMessage(state, { from: 'unknown', to: 'unknown', content: 'x', timestamp: 1 })).toBe(state);
  });
});
