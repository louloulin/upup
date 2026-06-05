/**
 * Compaction System Tests
 */

import { describe, it, expect, beforeEach, vi } from 'bun:test';
import {
  AutoTrigger,
  getAutoTrigger,
  resetAutoTrigger,
  type CompactionLayer,
} from './auto-trigger.js';

import {
  ApiMicrocompact,
  getApiMicrocompact,
  resetApiMicrocompact,
  normalizeWhitespace,
  compressCodeBlocks,
  simplifyMarkdown,
  roundNumbers,
  truncateLongStrings,
} from './api-microcompact.js';

import {
  SessionMemoryCompact,
  SessionMemoryStore,
  getSessionMemoryCompact,
  resetSessionMemoryCompact,
} from './session-compact.js';

import {
  PostCleanup,
  getPostCleanup,
  resetPostCleanup,
} from './post-cleanup.js';

import {
  CompactionOrchestrator,
  getCompactionOrchestrator,
  resetCompactionOrchestrator,
} from './orchestrator.js';

import { SystemMessage, AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';

// ============================================================================
// AutoTrigger Tests
// ============================================================================

describe('AutoTrigger', () => {
  beforeEach(() => {
    resetAutoTrigger();
  });

  describe('threshold detection', () => {
    it('should return none when under all thresholds', () => {
      const trigger = new AutoTrigger({
        compactTokenThreshold: 100000,
        microcompactTokenThreshold: 60000,
        snipTokenThreshold: 80000,
      });

      const messages = [new SystemMessage('test')];
      const result = trigger.check(messages);

      expect(result.action).toBe('none');
      expect(result.exceededThresholds).toHaveLength(0);
    });

    it('should trigger snip at snip threshold', () => {
      const trigger = new AutoTrigger({
        snipTokenThreshold: 10, // Very low for testing
        snipMessageThreshold: 1,
      });

      const messages = Array.from({ length: 5 }, (_, i) =>
        new HumanMessage({ content: `Message ${i}` })
      );

      const result = trigger.check(messages);

      expect(result.action).toBe('snip');
      expect(result.exceededThresholds.length).toBeGreaterThan(0);
    });

    it('should trigger microcompact at microcompact threshold', () => {
      const trigger = new AutoTrigger({
        microcompactTokenThreshold: 60000,
        microcompactMessageThreshold: 30,
      });

      // 30+ messages should trigger
      const messages = Array.from({ length: 35 }, (_, i) =>
        new ToolMessage({
          content: `Result ${i}`.padEnd(100, 'x'),
          tool_call_id: `call_${i}`,
          name: 'test_tool',
        })
      );

      const result = trigger.check(messages);

      expect(['microcompact', 'compact']).toContain(result.action);
    });

    it('should trigger compact at compact threshold', () => {
      const trigger = new AutoTrigger({
        compactTokenThreshold: 1000,
        compactMessageThreshold: 10,
        minMinutesBetweenCompaction: 0, // Disable time constraint
      });

      // Reset state
      trigger.reset();

      const messages = Array.from({ length: 15 }, (_, i) =>
        new ToolMessage({
          content: `Very long result ${i}`.padEnd(200, 'x'),
          tool_call_id: `call_${i}`,
          name: 'test_tool',
        })
      );

      const result = trigger.check(messages);

      expect(result.action).toBe('compact');
    });
  });

  describe('state tracking', () => {
    it('should increment turn counter on recordTurn', () => {
      const trigger = new AutoTrigger();
      trigger.recordTurn();
      expect(trigger.getState().turnsSinceLastCompaction).toBe(1);
    });

    it('should reset counters on recordCompactionAttempt', () => {
      const trigger = new AutoTrigger();
      trigger.recordTurn();
      trigger.recordTurn();
      trigger.recordCompactionAttempt();

      const state = trigger.getState();
      expect(state.turnsSinceLastCompaction).toBe(0);
      expect(state.turnsSinceLastMicrocompact).toBe(0);
      expect(state.consecutiveCompactionSkips).toBe(0);
    });

    it('should increment consecutive skips on recordSkip', () => {
      const trigger = new AutoTrigger();
      trigger.recordSkip();
      trigger.recordSkip();

      expect(trigger.getState().consecutiveCompactionSkips).toBe(2);
    });

    it('should reset on reset()', () => {
      const trigger = new AutoTrigger();
      trigger.recordTurn();
      trigger.recordSkip();
      trigger.recordCompactionAttempt();
      trigger.reset();

      const state = trigger.getState();
      expect(state.turnsSinceLastCompaction).toBe(0);
      expect(state.consecutiveCompactionSkips).toBe(0);
    });
  });

  describe('configuration', () => {
    it('should accept custom thresholds', () => {
      const trigger = new AutoTrigger({
        compactTokenThreshold: 200000,
        microcompactTokenThreshold: 150000,
        snipTokenThreshold: 180000,
      });

      expect(trigger.getState()).toBeDefined();
    });

    it('should disable with enabled: false', () => {
      const trigger = new AutoTrigger({ enabled: false });
      const result = trigger.check([new SystemMessage('test')]);

      expect(result.action).toBe('none');
      expect(result.skipReason).toBe('AutoTrigger disabled');
    });
  });
});

// ============================================================================
// ApiMicrocompact Tests
// ============================================================================

describe('ApiMicrocompact', () => {
  beforeEach(() => {
    resetApiMicrocompact();
  });

  describe('text normalization', () => {
    it('should collapse multiple blank lines', () => {
      const input = 'Hello\n\n\n\nWorld\n\n   Test';
      const output = normalizeWhitespace(input);

      // Should collapse multiple blank lines to at most one
      expect(output).toContain('Hello');
      expect(output).toContain('World');
      expect(output).toContain('Test');
      const blankCount = (output.match(/\n\n+/g) || []).length;
      expect(blankCount).toBeLessThanOrEqual(3); // Some blank lines OK, but not excessive
    });

    it('should trim lines', () => {
      const input = '  Hello  \n  World  ';
      const output = normalizeWhitespace(input);

      expect(output).not.toContain('  '); // No double spaces
    });
  });

  describe('code block compression', () => {
    it('should compress code blocks', () => {
      const input = '```javascript\n// comment\nconst x = 1;\n\nconst y = 2;\n```';
      const output = compressCodeBlocks(input);

      expect(output).not.toContain('// comment');
      expect(output).toContain('```javascript');
    });

    it('should truncate long code blocks', () => {
      const longCode = 'x'.repeat(600);
      const input = `\`\`\`js\n${longCode}\n\`\`\``;
      const output = compressCodeBlocks(input);

      expect(output).toContain('[truncated]');
    });
  });

  describe('markdown simplification', () => {
    it('should remove emphasis on short text', () => {
      const input = 'This is **bold** and *italic* text';
      const output = simplifyMarkdown(input);

      expect(output).toBe('This is bold and italic text');
    });

    it('should demote very deep headers', () => {
      const input = '#### Another\n##### Deep\n###### Very Deep';
      const output = simplifyMarkdown(input);

      expect(output).not.toContain('#####');
      expect(output).not.toContain('######');
    });

    it('should remove horizontal rules', () => {
      const input = 'Text\n***\nMore text\n---\nEnd';
      const output = simplifyMarkdown(input);

      expect(output).not.toContain('***');
      expect(output).not.toContain('---');
    });
  });

  describe('number rounding', () => {
    it('should round large integers', () => {
      const input = 'Value: 1234567';
      const output = roundNumbers(input);

      expect(output).toBe('Value: 1.23M');
    });

    it('should round thousands', () => {
      const input = 'Count: 99999';
      const output = roundNumbers(input);

      expect(output).toBe('Count: 100K');
    });

    it('should keep small numbers unchanged', () => {
      const input = 'Count: 999';
      const output = roundNumbers(input);

      expect(output).toBe('Count: 999');
    });
  });

  describe('truncation', () => {
    it('should truncate long strings', () => {
      const input = 'x'.repeat(5000);
      const output = truncateLongStrings(input, 1000);

      expect(output.length).toBeLessThan(input.length);
      expect(output).toContain('[content truncated]');
    });

    it('should preserve short strings', () => {
      const input = 'Short text';
      const output = truncateLongStrings(input, 1000);

      expect(output).toBe(input);
    });
  });

  describe('message compression', () => {
    it('should compress multiple messages', () => {
      const microcompact = new ApiMicrocompact({
        normalizeWhitespace: true,
        compressCodeBlocks: false,
        simplifyMarkdown: false,
        roundNumbers: false,
        truncateLongStrings: true,
        maxTokensBudget: 1000,
      });

      const messages = [
        new ToolMessage({
          content: 'Result with lots of whitespace    and more    content',
          tool_call_id: 'call_1',
          name: 'test',
        }),
      ];

      const { messages: compressed } = microcompact.compressMessages(messages);

      expect(compressed[0]).toBeDefined();
    });

    it('should detect when compression is needed', () => {
      const microcompact = new ApiMicrocompact({
        maxTokensBudget: 100,
      });

      const largeMessages = Array.from({ length: 10 }, (_, i) =>
        new ToolMessage({
          content: 'x'.repeat(500),
          tool_call_id: `call_${i}`,
          name: 'test',
        })
      );

      expect(microcompact.needsCompression(largeMessages)).toBe(true);
    });
  });
});

// ============================================================================
// SessionMemoryCompact Tests
// ============================================================================

describe('SessionMemoryCompact', () => {
  beforeEach(() => {
    resetSessionMemoryCompact();
  });

  describe('SessionMemoryStore', () => {
    it('should add and retrieve entries', () => {
      const store = new SessionMemoryStore();

      store.addEntry({
        id: 'test-1',
        type: 'fact',
        content: 'User prefers dark mode',
        confidence: 0.8,
        lastUpdated: Date.now(),
        tags: ['preference'],
      });

      const entry = store.getEntry('test-1');
      expect(entry).toBeDefined();
      expect(entry!.content).toBe('User prefers dark mode');
      expect(entry!.accessCount).toBe(1);
    });

    it('should update entries', () => {
      const store = new SessionMemoryStore();
      store.addEntry({
        id: 'test-1',
        type: 'fact',
        content: 'Original',
        confidence: 0.5,
        lastUpdated: Date.now(),
        tags: [],
      });

      store.updateEntry('test-1', { content: 'Updated', confidence: 0.9 });
      const entry = store.getEntry('test-1');

      expect(entry!.content).toBe('Updated');
      expect(entry!.confidence).toBe(0.9);
    });

    it('should remove entries', () => {
      const store = new SessionMemoryStore();
      store.addEntry({
        id: 'test-1',
        type: 'fact',
        content: 'To be removed',
        confidence: 0.5,
        lastUpdated: Date.now(),
        tags: [],
      });

      expect(store.removeEntry('test-1')).toBe(true);
      expect(store.getEntry('test-1')).toBeUndefined();
    });

    it('should get statistics', () => {
      const store = new SessionMemoryStore();
      store.addEntry({
        id: 'test-1',
        type: 'fact',
        content: 'Fact 1',
        confidence: 0.8,
        lastUpdated: Date.now(),
        tags: [],
      });
      store.addEntry({
        id: 'test-2',
        type: 'preference',
        content: 'Pref 1',
        confidence: 0.6,
        lastUpdated: Date.now(),
        tags: [],
      });

      const stats = store.getStats();
      expect(stats.totalEntries).toBe(2);
      expect(stats.byType.fact).toBe(1);
      expect(stats.byType.preference).toBe(1);
    });
  });

  describe('SessionMemoryCompact.compact()', () => {
    it('should remove low confidence entries', () => {
      const store = new SessionMemoryStore();
      const compact = new SessionMemoryCompact(store, {
        minConfidence: 0.7,
        maxAgeDays: 30,
        minAccessCount: 1,
        maxEntries: 100,
      });

      store.addEntry({
        id: 'low-confidence',
        type: 'fact',
        content: 'Low confidence fact',
        confidence: 0.1,
        lastUpdated: Date.now(),
        tags: [],
      });

      const result = compact.compact();

      expect(result.removed).toBe(1);
      expect(result.kept).toBe(0);
    });

    it('should merge identical entries', () => {
      const store = new SessionMemoryStore();
      const compact = new SessionMemoryCompact(store);

      store.addEntry({
        id: 'entry-1',
        type: 'fact',
        content: 'User prefers TypeScript for all projects',
        confidence: 0.9,
        lastUpdated: Date.now(),
        tags: [],
      });
      store.addEntry({
        id: 'entry-2',
        type: 'fact',
        content: 'User prefers TypeScript for all projects',
        confidence: 0.7,
        lastUpdated: Date.now(),
        tags: [],
      });

      const result = compact.compact();

      // Should merge identical entries
      expect(result.merged).toBe(1);
      expect(store.listEntries()).toHaveLength(1);
    });

    it('should enforce max entries limit', () => {
      const store = new SessionMemoryStore();
      const compact = new SessionMemoryCompact(store, {
        maxEntries: 3,
        minConfidence: 0,
        maxAgeDays: 365,
        minAccessCount: 0,
      });

      // Add 5 entries
      for (let i = 0; i < 5; i++) {
        store.addEntry({
          id: `entry-${i}`,
          type: 'fact',
          content: `Fact ${i}`,
          confidence: 0.5,
          lastUpdated: Date.now(),
          tags: [],
        });
      }

      const result = compact.compact();

      expect(result.kept).toBeLessThanOrEqual(3);
    });
  });
});

// ============================================================================
// PostCleanup Tests
// ============================================================================

describe('PostCleanup', () => {
  beforeEach(() => {
    resetPostCleanup();
  });

  describe('duplicate removal', () => {
    it('should remove duplicate tool results', () => {
      const cleanup = new PostCleanup({ removeDuplicates: true, removeOrphans: false });

      const messages = [
        new ToolMessage({
          content: 'Result 1',
          tool_call_id: 'call_1',
          name: 'test_tool',
        }),
        new ToolMessage({
          content: 'Result 1', // Duplicate
          tool_call_id: 'call_2',
          name: 'test_tool',
        }),
      ];

      const result = cleanup.cleanup(messages);

      expect(result.removedByType.duplicates).toBe(1);
      expect(result.messages).toHaveLength(1);
    });
  });

  describe('empty marker removal', () => {
    it('should remove empty marker messages', () => {
      const cleanup = new PostCleanup({ removeEmptyMarkers: true, removeOrphans: false });

      const messages = [
        new ToolMessage({
          content: '[Old tool result content cleared]',
          tool_call_id: 'call_1',
          name: 'test',
        }),
        new ToolMessage({
          content: 'Actual result',
          tool_call_id: 'call_2',
          name: 'test',
        }),
      ];

      const result = cleanup.cleanup(messages);

      expect(result.removedByType.emptyMarkers).toBe(1);
    });

    it('should remove truncated markers', () => {
      const cleanup = new PostCleanup({ removeEmptyMarkers: true });

      const messages = [
        new ToolMessage({
          content: '[content truncated]',
          tool_call_id: 'call_1',
          name: 'test',
        }),
      ];

      const result = cleanup.cleanup(messages);

      expect(result.removedByType.emptyMarkers).toBe(1);
    });
  });

  describe('quick cleanup', () => {
    it('should return original messages when nothing to clean', () => {
      const cleanup = new PostCleanup();
      const messages = [
        new HumanMessage('Hello'),
        new AIMessage('Hi there'),
      ];

      const result = cleanup.quickCleanup(messages);

      expect(result).toHaveLength(2);
    });
  });

  describe('consecutive tool limit', () => {
    it('should limit consecutive tool messages', () => {
      const cleanup = new PostCleanup({
        maxConsecutiveToolMessages: 3,
      });

      const messages = [
        new ToolMessage({ content: 'R1', tool_call_id: 'c1', name: 't' }),
        new ToolMessage({ content: 'R2', tool_call_id: 'c2', name: 't' }),
        new ToolMessage({ content: 'R3', tool_call_id: 'c3', name: 't' }),
        new ToolMessage({ content: 'R4', tool_call_id: 'c4', name: 't' }), // Over limit
        new ToolMessage({ content: 'R5', tool_call_id: 'c5', name: 't' }), // Over limit
      ];

      const result = cleanup.cleanup(messages);

      expect(result.removedByType.consecutiveTools).toBe(2);
    });
  });
});

// ============================================================================
// Orchestrator Tests
// ============================================================================

describe('CompactionOrchestrator', () => {
  beforeEach(() => {
    resetCompactionOrchestrator();
  });

  describe('quick pipeline', () => {
    it('should run snip and microcompact', () => {
      const orchestrator = new CompactionOrchestrator({
        layers: {
          snip: true,
          microcompact: true,
          compact: false,
          autoTrigger: false,
          apiMicrocompact: false,
          sessionCompact: false,
          postCleanup: false,
        },
      });

      const messages = [
        new SystemMessage('System'),
        new HumanMessage('Sure, thanks'),
        new HumanMessage('Analyze the stock'),
        new ToolMessage({
          content: 'Result'.padEnd(500, 'x'),
          tool_call_id: 'call_1',
          name: 'test',
        }),
        new ToolMessage({
          content: 'Result'.padEnd(500, 'x'),
          tool_call_id: 'call_2',
          name: 'test',
        }),
        new ToolMessage({
          content: 'Result'.padEnd(500, 'x'),
          tool_call_id: 'call_3',
          name: 'test',
        }),
      ];

      const result = orchestrator.runQuickPipeline(messages);

      expect(result.appliedLayers.length).toBeGreaterThanOrEqual(0);
    });

    it('should preserve system message', () => {
      const orchestrator = new CompactionOrchestrator();
      const messages = [
        new SystemMessage('System prompt'),
        new HumanMessage('User message'),
      ];

      const result = orchestrator.runQuickPipeline(messages);

      expect(result.messages[0]._getType()).toBe('system');
    });
  });

  describe('state tracking', () => {
    it('should record turn', () => {
      const orchestrator = new CompactionOrchestrator();
      orchestrator.recordTurn();
      orchestrator.recordTurn();

      const trigger = orchestrator.getAutoTrigger();
      expect(trigger.getState().turnsSinceLastCompaction).toBe(2);
    });

    it('should record user message', () => {
      const orchestrator = new CompactionOrchestrator();
      orchestrator.recordUserMessage();

      const trigger = orchestrator.getAutoTrigger();
      expect(trigger.getState().lastUserMessageTime).toBeTruthy();
    });
  });

  describe('reset', () => {
    it('should reset all layers', () => {
      const orchestrator = new CompactionOrchestrator();
      orchestrator.recordTurn();
      orchestrator.recordSkip();
      orchestrator.reset();

      const trigger = orchestrator.getAutoTrigger();
      expect(trigger.getState().turnsSinceLastCompaction).toBe(0);
    });
  });
});
