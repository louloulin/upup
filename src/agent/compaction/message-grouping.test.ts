/**
 * Tests for Message Grouping
 */

import { describe, it, expect } from 'vitest';
import {
  groupMessages,
  getRoundSummary,
  getMessageRole,
  type MessageRound,
} from './message-grouping.js';
import {
  HumanMessage,
  AIMessage,
  ToolMessage,
  SystemMessage,
} from '@langchain/core/messages';

describe('getMessageRole', () => {
  it('should identify system messages', () => {
    expect(getMessageRole(new SystemMessage('system'))).toBe('system');
  });

  it('should identify human messages', () => {
    expect(getMessageRole(new HumanMessage('hello'))).toBe('human');
  });

  it('should identify AI messages', () => {
    expect(getMessageRole(new AIMessage('response'))).toBe('ai');
  });

  it('should identify tool messages', () => {
    expect(getMessageRole(new ToolMessage({ content: 'result', tool_call_id: 'tc1' }))).toBe('tool');
  });
});

describe('groupMessages', () => {
  it('should return empty result for empty input', () => {
    const result = groupMessages([]);
    expect(result.rounds).toEqual([]);
    expect(result.totalMessages).toBe(0);
    expect(result.totalTokens).toBe(0);
  });

  it('should group a single message into one round', () => {
    const messages = [new HumanMessage('Hello')];
    const result = groupMessages(messages);
    expect(result.rounds).toHaveLength(1);
    expect(result.rounds[0].role).toBe('human');
    expect(result.rounds[0].messages).toHaveLength(1);
    expect(result.totalMessages).toBe(1);
  });

  it('should group consecutive messages of the same type', () => {
    const messages = [
      new HumanMessage('Message 1'),
      new HumanMessage('Message 2'),
      new HumanMessage('Message 3'),
    ];
    const result = groupMessages(messages);
    expect(result.rounds).toHaveLength(1);
    expect(result.rounds[0].messages).toHaveLength(3);
    expect(result.rounds[0].role).toBe('human');
  });

  it('should separate different role types into different rounds', () => {
    const messages = [
      new HumanMessage('Question'),
      new AIMessage('Answer'),
      new HumanMessage('Follow-up'),
      new AIMessage('Follow-up answer'),
    ];
    const result = groupMessages(messages);
    expect(result.rounds).toHaveLength(4);
    expect(result.rounds[0].role).toBe('human');
    expect(result.rounds[1].role).toBe('ai');
    expect(result.rounds[2].role).toBe('human');
    expect(result.rounds[3].role).toBe('ai');
  });

  it('should group AI and Tool messages together', () => {
    const messages = [
      new HumanMessage('Search for AAPL'),
      new AIMessage({
        content: 'Let me search',
        tool_calls: [{ name: 'web_search', args: { query: 'AAPL' }, id: 'tc1' }],
      }),
      new ToolMessage({ content: 'AAPL price: $150', tool_call_id: 'tc1', name: 'web_search' }),
    ];
    const result = groupMessages(messages);
    // Human is its own round, AI+Tool is grouped together
    expect(result.rounds).toHaveLength(2);
    expect(result.rounds[0].role).toBe('human');
    expect(result.rounds[1].messages).toHaveLength(2); // AI + Tool
  });

  it('should always start a new round for system messages', () => {
    const messages = [
      new HumanMessage('Question'),
      new SystemMessage('System instruction'),
      new HumanMessage('Another question'),
    ];
    const result = groupMessages(messages);
    expect(result.rounds).toHaveLength(3);
    expect(result.rounds[1].role).toBe('system');
  });

  it('should estimate tokens for each round', () => {
    const messages = [
      new HumanMessage('Short'),
      new AIMessage('A longer response with more words in it to test token estimation'),
    ];
    const result = groupMessages(messages);
    expect(result.rounds[0].estimatedTokens).toBeGreaterThan(0);
    expect(result.rounds[1].estimatedTokens).toBeGreaterThan(result.rounds[0].estimatedTokens);
    expect(result.totalTokens).toBeGreaterThan(0);
  });

  it('should handle complex conversation flow', () => {
    const messages = [
      new SystemMessage('You are helpful'),
      new HumanMessage('Search for AAPL'),
      new AIMessage({
        content: 'Searching',
        tool_calls: [{ name: 'web_search', args: { query: 'AAPL' }, id: 'tc1' }],
      }),
      new ToolMessage({ content: 'AAPL price $150', tool_call_id: 'tc1', name: 'web_search' }),
      new AIMessage('AAPL is trading at $150'),
      new HumanMessage('What about MSFT?'),
      new AIMessage({
        content: 'Searching MSFT',
        tool_calls: [{ name: 'web_search', args: { query: 'MSFT' }, id: 'tc2' }],
      }),
      new ToolMessage({ content: 'MSFT price $400', tool_call_id: 'tc2', name: 'web_search' }),
    ];
    const result = groupMessages(messages);

    // System, Human, AI+Tool, AI, Human, AI+Tool
    expect(result.rounds.length).toBeGreaterThanOrEqual(4);
    expect(result.totalMessages).toBe(8);
    expect(result.totalTokens).toBeGreaterThan(0);
  });

  it('should assign sequential indices to rounds', () => {
    const messages = [
      new HumanMessage('Q1'),
      new AIMessage('A1'),
      new HumanMessage('Q2'),
    ];
    const result = groupMessages(messages);
    result.rounds.forEach((round, idx) => {
      expect(round.index).toBe(idx);
    });
  });
});

describe('getRoundSummary', () => {
  it('should summarize a single human message', () => {
    const round: MessageRound = {
      index: 0,
      messages: [new HumanMessage('What is the price of AAPL?')],
      role: 'human',
      estimatedTokens: 10,
    };
    const summary = getRoundSummary(round);
    expect(summary).toContain('HUMAN');
    expect(summary).toContain('What is the price of AAPL?');
  });

  it('should summarize a single AI message with tool calls', () => {
    const round: MessageRound = {
      index: 1,
      messages: [new AIMessage({
        content: 'Searching',
        tool_calls: [{ name: 'web_search', args: { query: 'AAPL' }, id: 'tc1' }],
      })],
      role: 'ai',
      estimatedTokens: 15,
    };
    const summary = getRoundSummary(round);
    expect(summary).toContain('AI');
    expect(summary).toContain('web_search');
  });

  it('should summarize tool messages', () => {
    const round: MessageRound = {
      index: 2,
      messages: [new ToolMessage({ content: 'AAPL: $150', tool_call_id: 'tc1', name: 'web_search' })],
      role: 'tool',
      estimatedTokens: 5,
    };
    const summary = getRoundSummary(round);
    expect(summary).toContain('TOOL');
    expect(summary).toContain('web_search');
  });

  it('should summarize multiple messages in a round', () => {
    const round: MessageRound = {
      index: 3,
      messages: [
        new AIMessage({ content: 'Searching', tool_calls: [{ name: 't1', args: {}, id: 'tc1' }] }),
        new ToolMessage({ content: 'result1', tool_call_id: 'tc1', name: 't1' }),
        new ToolMessage({ content: 'result2', tool_call_id: 'tc2', name: 't2' }),
      ],
      role: 'ai',
      estimatedTokens: 30,
    };
    const summary = getRoundSummary(round);
    expect(summary).toContain('3 messages');
    expect(summary).toContain('t1');
    expect(summary).toContain('t2');
  });

  it('should truncate long content in summary', () => {
    const longContent = 'x'.repeat(200);
    const round: MessageRound = {
      index: 0,
      messages: [new HumanMessage(longContent)],
      role: 'human',
      estimatedTokens: 50,
    };
    const summary = getRoundSummary(round);
    // Summary should not contain the full 200-char string
    expect(summary.length).toBeLessThan(longContent.length + 50);
    expect(summary).toContain('...');
  });
});
