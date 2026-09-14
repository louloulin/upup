import type { AgentRunnerPorts } from '@upup/pi-tui-app';

export function createTestPorts(overrides: Partial<AgentRunnerPorts> = {}): AgentRunnerPorts {
  const ports: AgentRunnerPorts = {
    stream: async function* () {
      yield {
        type: 'run_end',
        sessionId: 'test-session',
        answer: '',
        iterations: 0,
        totalTime: 0,
      };
    },
    sessionService: {
      create: async () => ({ id: 'test-session' }),
      fork: async (id) => ({ id: `${id}-fork` }),
      messages: async () => [],
    },
    sessionTracker: {
      startSession: async (id) => id,
      isToolApproved: () => false,
    },
    fileHistory: {
      initialize: () => {},
      record: () => {},
    },
    messageQueue: {
      enqueue: () => {},
      dequeue: () => undefined,
      dequeueAll: () => [],
      peek: () => undefined,
      length: () => 0,
      isEmpty: () => true,
      snapshot: () => [],
      subscribe: () => () => {},
      clear: () => {},
    },
    renderMessages: () => [],
  };
  return { ...ports, ...overrides };
}
