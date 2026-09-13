import { describe, expect, test } from 'bun:test';
import { addPlatformAgentMemory, createInitialPlatformAgentState, createPlatformAgent, getPlatformAgentMemory, listPlatformAgentMemories, parsePlatformAgentState, PLATFORM_BUILTIN_AGENTS, updatePlatformAgent } from './agents.js';

describe('pi-platform agents', () => {
  test('tracks agent lifecycle and session-scoped memory', () => {
    let state = createPlatformAgent(createInitialPlatformAgentState(), { id: 'a1', name: 'worker', role: 'research', prompt: 'Find evidence', tools: '*', createdAt: 1 }, 1);
    state = updatePlatformAgent(state, 'a1', { status: 'completed', output: 'done', sessionId: 'worker-session' }, 2);
    state = addPlatformAgentMemory(state, { id: 'm1', agentId: 'a1', content: 'evidence', type: 'result', createdAt: 2 });
    const read = getPlatformAgentMemory(state, 'm1');
    expect(read.memory?.accessCount).toBe(1);
    expect(listPlatformAgentMemories(read.state, 'a1')).toHaveLength(1);
    expect(read.state.agents[0]).toMatchObject({ status: 'completed', output: 'done' });
  });

  test('fails closed for malformed state and exposes built-ins', () => {
    expect(parsePlatformAgentState({ schema: 2 })).toEqual(createInitialPlatformAgentState());
    expect(PLATFORM_BUILTIN_AGENTS.map((agent) => agent.name)).toContain('researcher');
  });
});
