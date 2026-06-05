/**
 * In-process Pub/Sub Event Bus
 *
 * Lightweight topic-based event bus with wildcard subscriptions and an
 * optional replay buffer. Producers and consumers are fully decoupled —
 * neither knows about the other, which lets the realtime feed, news
 * scanner, proactive kairos agent, UI, and bridge all coexist without
 * direct wiring.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/event-bus
 */

export interface BusEvent<T = unknown> {
  topic: string;
  payload: T;
  timestamp: number;
  /** Monotonic id assigned at emit time, used for replay ordering. */
  seq: number;
}

export type BusHandler<T = unknown> = (event: BusEvent<T>) => void;

export interface SubscribeOptions {
  /** Replay matching history before receiving live events. */
  replay?: boolean;
}

export interface EventBus {
  /** Subscribe to a topic (supports `*` wildcard at the end of any segment). */
  on<T = unknown>(topic: string, handler: BusHandler<T>, opts?: SubscribeOptions): () => void;
  /** Subscribe to a topic, auto-unsubscribe after first matching event. */
  once<T = unknown>(topic: string, handler: BusHandler<T>): () => void;
  /** Unsubscribe a specific handler from a topic. */
  off<T = unknown>(topic: string, handler: BusHandler<T>): void;
  /** Publish an event. Returns the seq number assigned. */
  emit<T = unknown>(topic: string, payload: T): number;
  /** Replay buffer size. Older events are dropped. */
  readonly bufferSize: number;
  /** Current event count in the buffer. */
  historyLength(): number;
  /** Clear the replay buffer (does not affect live subscribers). */
  clearHistory(): void;
}

/** Match `pattern` against `topic`. Pattern supports trailing `*` per segment. */
export function topicMatches(pattern: string, topic: string): boolean {
  if (pattern === topic) return true;
  if (pattern === '*') return true;
  const pSegs = pattern.split('.');
  const tSegs = topic.split('.');
  if (pSegs.length !== tSegs.length) return false;
  for (let i = 0; i < pSegs.length; i++) {
    if (pSegs[i] === '*') continue;
    if (pSegs[i] !== tSegs[i]) return false;
  }
  return true;
}

const DEFAULT_BUFFER = 1000;

/** Build a fresh event bus. The CLI process owns one; tests can spin up more. */
export function createEventBus(opts?: { bufferSize?: number }): EventBus {
  const bufferSize = opts?.bufferSize ?? DEFAULT_BUFFER;
  const handlers = new Map<string, Set<BusHandler>>();
  const history: BusEvent[] = [];
  let nextSeq = 1;

  function addHandler(topic: string, handler: BusHandler): void {
    let set = handlers.get(topic);
    if (!set) {
      set = new Set();
      handlers.set(topic, set);
    }
    set.add(handler);
  }

  function removeHandler(topic: string, handler: BusHandler): void {
    handlers.get(topic)?.delete(handler);
  }

  function replayFor(topic: string): BusEvent[] {
    return history.filter((e) => topicMatches(topic, e.topic));
  }

  function dispatch(event: BusEvent): void {
    for (const [pattern, set] of handlers) {
      if (!topicMatches(pattern, event.topic)) continue;
      for (const handler of set) {
        try {
          void handler(event);
        } catch (err) {
          // Handler errors must not break the bus or other subscribers.
          // Surface them on stderr; production observability can hook a
          // dedicated `bus.error` topic if needed.
          // eslint-disable-next-line no-console
          console.error(`[event-bus] handler for "${pattern}" threw:`, err);
        }
      }
    }
  }

  return {
    on<T>(topic: string, handler: BusHandler<T>, opts?: SubscribeOptions) {
      addHandler(topic, handler as BusHandler);
      if (opts?.replay) {
        for (const past of replayFor(topic)) {
          try {
            void handler(past as BusEvent<T>);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error(`[event-bus] replay handler for "${topic}" threw:`, err);
          }
        }
      }
      return () => removeHandler(topic, handler as BusHandler);
    },
    once<T>(topic: string, handler: BusHandler<T>) {
      const wrapper: BusHandler = (event) => {
        removeHandler(topic, wrapper);
        return handler(event as BusEvent<T>);
      };
      addHandler(topic, wrapper);
      return () => removeHandler(topic, wrapper);
    },
    off<T>(topic: string, handler: BusHandler<T>) {
      removeHandler(topic, handler as BusHandler);
    },
    emit<T>(topic: string, payload: T): number {
      const event: BusEvent<T> = { topic, payload, timestamp: Date.now(), seq: nextSeq++ };
      history.push(event as BusEvent);
      if (history.length > bufferSize) {
        history.splice(0, history.length - bufferSize);
      }
      dispatch(event as BusEvent);
      return event.seq;
    },
    bufferSize,
    historyLength() {
      return history.length;
    },
    clearHistory() {
      history.length = 0;
    },
  };
}

/** Process-wide default bus. Lazily initialized. */
let defaultBus: EventBus | null = null;
export function getDefaultBus(): EventBus {
  if (!defaultBus) defaultBus = createEventBus();
  return defaultBus;
}

/** Reset the default bus (used by tests / hot reload). */
export function resetDefaultBus(): void {
  defaultBus = null;
}
