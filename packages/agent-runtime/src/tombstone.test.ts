/**
 * Unit tests for Tombstone Handler
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import {
  createTombstone,
  createStreamingTombstone,
  createOrphanedTombstone,
  filterTombstones,
  extractTombstones,
  isTombstone,
  getTombstoneStats,
  TombstoneRegistry,
  getTombstoneRegistry,
  resetTombstoneRegistry,
  type TombstoneMessage,
  type TombstoneReason,
} from './tombstone.js';

describe('Tombstone Creation', () => {
  test('createTombstone creates basic tombstone', () => {
    const tombstone = createTombstone('msg-123', 'streaming_failed');

    expect(tombstone.type).toBe('tombstone');
    expect(tombstone.originalId).toBe('msg-123');
    expect(tombstone.reason).toBe('streaming_failed');
    expect(tombstone.timestamp).toBeGreaterThan(0);
  });

  test('createTombstone includes metadata', () => {
    const tombstone = createTombstone('msg-456', 'orphaned', {
      toolName: 'bash',
      errorMessage: 'Command failed',
    });

    expect(tombstone.metadata?.toolName).toBe('bash');
    expect(tombstone.metadata?.errorMessage).toBe('Command failed');
  });

  test('createStreamingTombstone includes streaming context', () => {
    const context = {
      messageId: 'msg-789',
      toolName: 'read_file',
      partialContent: 'partial content...',
      error: new Error('Stream interrupted'),
    };

    const tombstone = createStreamingTombstone(context);

    expect(tombstone.originalId).toBe('msg-789');
    expect(tombstone.reason).toBe('streaming_failed');
    expect(tombstone.metadata?.toolName).toBe('read_file');
    expect(tombstone.metadata?.errorMessage).toBe('Stream interrupted');
    // partialContent is stored as originalContent
    expect(tombstone.metadata?.originalContent).toBe('partial content...');
  });

  test('createOrphanedTombstone with default reason', () => {
    const tombstone = createOrphanedTombstone('msg-001');

    expect(tombstone.originalId).toBe('msg-001');
    expect(tombstone.reason).toBe('orphaned');
  });

  test('createOrphanedTombstone with custom reason', () => {
    const tombstone = createOrphanedTombstone('msg-002', 'Parent cancelled');

    expect(tombstone.metadata?.errorMessage).toBe('Parent cancelled');
  });
});

describe('Tombstone Filtering', () => {
  interface TestMessage {
    id: string;
    tombstone?: TombstoneMessage;
  }

  test('filterTombstones removes tombstoned messages', () => {
    const messages: TestMessage[] = [
      { id: '1' },
      { id: '2', tombstone: createTombstone('2', 'streaming_failed') },
      { id: '3' },
      { id: '4', tombstone: createTombstone('4', 'cancelled') },
      { id: '5' },
    ];

    const filtered = filterTombstones(messages);

    expect(filtered).toHaveLength(3);
    expect(filtered.map(m => m.id)).toEqual(['1', '3', '5']);
  });

  test('extractTombstones extracts only tombstones', () => {
    const messages: TestMessage[] = [
      { id: '1' },
      { id: '2', tombstone: createTombstone('2', 'streaming_failed') },
      { id: '3' },
      { id: '4', tombstone: createTombstone('4', 'context_overflow') },
    ];

    const tombstones = extractTombstones(messages);

    expect(tombstones).toHaveLength(2);
    expect(tombstones[0].originalId).toBe('2');
    expect(tombstones[1].originalId).toBe('4');
  });

  test('isTombstone identifies correctly', () => {
    const withTombstone = { id: '1', tombstone: createTombstone('1', 'orphaned') };
    const withoutTombstone = { id: '2', tombstone: undefined };

    expect(isTombstone(withTombstone)).toBe(true);
    expect(isTombstone(withoutTombstone)).toBe(false);
  });
});

describe('Tombstone Statistics', () => {
  test('getTombstoneStats calculates correctly', () => {
    const tombstones: TombstoneMessage[] = [
      createTombstone('1', 'streaming_failed'),
      createTombstone('2', 'streaming_failed'),
      createTombstone('3', 'orphaned'),
      createTombstone('4', 'cancelled'),
      createTombstone('5', 'context_overflow'),
    ];

    const stats = getTombstoneStats(tombstones);

    expect(stats.total).toBe(5);
    expect(stats.byReason.streaming_failed).toBe(2);
    expect(stats.byReason.orphaned).toBe(1);
    expect(stats.byReason.cancelled).toBe(1);
    expect(stats.byReason.context_overflow).toBe(1);
    expect(stats.oldest).toBeDefined();
    expect(stats.newest).toBeDefined();
  });

  test('getTombstoneStats handles empty array', () => {
    const stats = getTombstoneStats([]);

    expect(stats.total).toBe(0);
    expect(stats.byReason.streaming_failed).toBe(0);
    expect(stats.oldest).toBeUndefined();
    expect(stats.newest).toBeUndefined();
  });
});

describe('TombstoneRegistry', () => {
  let registry: TombstoneRegistry;

  beforeEach(() => {
    registry = new TombstoneRegistry();
  });

  test('add and get tombstone', () => {
    const tombstone = createTombstone('test-1', 'streaming_failed');
    registry.add(tombstone);

    expect(registry.has('test-1')).toBe(true);
    expect(registry.get('test-1')).toEqual(tombstone);
  });

  test('has returns false for non-existent', () => {
    expect(registry.has('non-existent')).toBe(false);
  });

  test('getAll returns all tombstones', () => {
    registry.add(createTombstone('1', 'streaming_failed'));
    registry.add(createTombstone('2', 'orphaned'));
    registry.add(createTombstone('3', 'cancelled'));

    const all = registry.getAll();
    expect(all).toHaveLength(3);
  });

  test('clear removes all tombstones', () => {
    registry.add(createTombstone('1', 'streaming_failed'));
    registry.add(createTombstone('2', 'orphaned'));
    registry.clear();

    expect(registry.count).toBe(0);
  });

  test('count returns correct number', () => {
    expect(registry.count).toBe(0);
    registry.add(createTombstone('1', 'streaming_failed'));
    expect(registry.count).toBe(1);
    registry.add(createTombstone('2', 'orphaned'));
    expect(registry.count).toBe(2);
  });

  test('removeOlderThan removes correct tombstones', () => {
    const old = createTombstone('old', 'streaming_failed');
    old.timestamp = Date.now() - 10000;

    const recent = createTombstone('recent', 'orphaned');
    recent.timestamp = Date.now();

    registry.add(old);
    registry.add(recent);

    const removed = registry.removeOlderThan(Date.now() - 5000);

    expect(removed).toBe(1);
    expect(registry.has('old')).toBe(false);
    expect(registry.has('recent')).toBe(true);
  });

  test('enforces max tombstones limit', () => {
    // Default max is 100
    for (let i = 0; i < 150; i++) {
      registry.add(createTombstone(`tomb-${i}`, 'streaming_failed'));
    }

    expect(registry.count).toBe(100);
  });

  test('singleton getTombstoneRegistry', () => {
    resetTombstoneRegistry();
    const reg1 = getTombstoneRegistry();
    const reg2 = getTombstoneRegistry();

    expect(reg1).toBe(reg2);

    resetTombstoneRegistry();
  });
});

describe('All Tombstone Reasons', () => {
  const reasons: TombstoneReason[] = [
    'streaming_failed',
    'orphaned',
    'obsolete',
    'cancelled',
    'context_overflow',
  ];

  for (const reason of reasons) {
    test(`createTombstone supports ${reason} reason`, () => {
      const tombstone = createTombstone(`msg-${reason}`, reason);
      expect(tombstone.reason).toBe(reason);
    });
  }
});
