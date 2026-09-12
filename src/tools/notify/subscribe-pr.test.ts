/**
 * Tests for SubscribePR Tool
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  SubscribePRSchema,
  UnsubscribePRSchema,
  ListPRSubscriptionsSchema,
  createSubscribePRTool,
  createUnsubscribePRTool,
  createListPRSubscriptionsTool,
  subscribe,
  unsubscribe,
  listSubscriptions,
  clearSubscriptions,
  SUBSCRIBE_PR_DESCRIPTION,
} from './subscribe-pr.js';

beforeEach(() => {
  clearSubscriptions();
});

describe('SubscribePRSchema', () => {
  it('should parse valid input', () => {
    const result = SubscribePRSchema.safeParse({
      repo: 'owner/repo',
      prNumber: 123,
      webhookUrl: 'https://example.com/webhook',
      events: ['comment', 'merge'],
    });
    expect(result.success).toBe(true);
  });

  it('should require repo', () => {
    const result = SubscribePRSchema.safeParse({
      prNumber: 123,
      webhookUrl: 'https://example.com/webhook',
      events: ['comment'],
    });
    expect(result.success).toBe(false);
  });

  it('should require prNumber', () => {
    const result = SubscribePRSchema.safeParse({
      repo: 'owner/repo',
      webhookUrl: 'https://example.com/webhook',
      events: ['comment'],
    });
    expect(result.success).toBe(false);
  });

  it('should require webhookUrl', () => {
    const result = SubscribePRSchema.safeParse({
      repo: 'owner/repo',
      prNumber: 123,
      events: ['comment'],
    });
    expect(result.success).toBe(false);
  });

  it('should require at least one event', () => {
    const result = SubscribePRSchema.safeParse({
      repo: 'owner/repo',
      prNumber: 123,
      webhookUrl: 'https://example.com/webhook',
      events: [],
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid webhook URL', () => {
    const result = SubscribePRSchema.safeParse({
      repo: 'owner/repo',
      prNumber: 123,
      webhookUrl: 'not-a-url',
      events: ['comment'],
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid event types', () => {
    const result = SubscribePRSchema.safeParse({
      repo: 'owner/repo',
      prNumber: 123,
      webhookUrl: 'https://example.com/webhook',
      events: ['invalid_event'],
    });
    expect(result.success).toBe(false);
  });

  it('should accept all valid event types', () => {
    const result = SubscribePRSchema.safeParse({
      repo: 'owner/repo',
      prNumber: 123,
      webhookUrl: 'https://example.com/webhook',
      events: ['comment', 'review', 'merge', 'close', 'reopen', 'label', 'assign', 'ready_for_review'],
    });
    expect(result.success).toBe(true);
  });

  it('should reject negative prNumber', () => {
    const result = SubscribePRSchema.safeParse({
      repo: 'owner/repo',
      prNumber: -1,
      webhookUrl: 'https://example.com/webhook',
      events: ['comment'],
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty repo', () => {
    const result = SubscribePRSchema.safeParse({
      repo: '',
      prNumber: 123,
      webhookUrl: 'https://example.com/webhook',
      events: ['comment'],
    });
    expect(result.success).toBe(false);
  });
});

describe('UnsubscribePRSchema', () => {
  it('should parse valid subscription ID', () => {
    const result = UnsubscribePRSchema.safeParse({ subscriptionId: 'pr-sub-123' });
    expect(result.success).toBe(true);
  });

  it('should require subscriptionId', () => {
    const result = UnsubscribePRSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should reject empty subscriptionId', () => {
    const result = UnsubscribePRSchema.safeParse({ subscriptionId: '' });
    expect(result.success).toBe(false);
  });
});

describe('ListPRSubscriptionsSchema', () => {
  it('should parse empty input', () => {
    const result = ListPRSubscriptionsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should parse with repo filter', () => {
    const result = ListPRSubscriptionsSchema.safeParse({ repo: 'owner/repo' });
    expect(result.success).toBe(true);
  });

  it('should parse with activeOnly', () => {
    const result = ListPRSubscriptionsSchema.safeParse({ activeOnly: false });
    expect(result.success).toBe(true);
  });

  it('should parse with all options', () => {
    const result = ListPRSubscriptionsSchema.safeParse({
      repo: 'owner/repo',
      activeOnly: true,
    });
    expect(result.success).toBe(true);
  });
});

describe('subscribe function', () => {
  it('should create a subscription', () => {
    const sub = subscribe('owner/repo', 123, 'https://example.com/hook', ['comment', 'merge']);

    expect(sub.repo).toBe('owner/repo');
    expect(sub.prNumber).toBe(123);
    expect(sub.webhookUrl).toBe('https://example.com/hook');
    expect(sub.events).toEqual(['comment', 'merge']);
    expect(sub.active).toBe(true);
    expect(sub.id).toMatch(/^pr-sub-/);
    expect(sub.createdAt).toBeGreaterThan(0);
  });

  it('should store the subscription', () => {
    const sub = subscribe('owner/repo', 42, 'https://example.com/hook', ['review']);
    const subs = listSubscriptions();
    expect(subs).toHaveLength(1);
    expect(subs[0].id).toBe(sub.id);
  });

  it('should create unique IDs', () => {
    const sub1 = subscribe('owner/repo', 1, 'https://example.com/hook1', ['comment']);
    const sub2 = subscribe('owner/repo', 2, 'https://example.com/hook2', ['merge']);
    expect(sub1.id).not.toBe(sub2.id);
  });
});

describe('unsubscribe function', () => {
  it('should remove a subscription', () => {
    const sub = subscribe('owner/repo', 123, 'https://example.com/hook', ['comment']);
    expect(listSubscriptions()).toHaveLength(1);

    const removed = unsubscribe(sub.id);
    expect(removed).toBe(true);
    expect(listSubscriptions()).toHaveLength(0);
  });

  it('should return false for non-existent subscription', () => {
    const removed = unsubscribe('non-existent-id');
    expect(removed).toBe(false);
  });
});

describe('listSubscriptions function', () => {
  it('should return empty list when no subscriptions', () => {
    expect(listSubscriptions()).toEqual([]);
  });

  it('should return all subscriptions', () => {
    subscribe('owner/repo1', 1, 'https://example.com/hook1', ['comment']);
    subscribe('owner/repo2', 2, 'https://example.com/hook2', ['merge']);

    const subs = listSubscriptions();
    expect(subs).toHaveLength(2);
  });

  it('should filter by repo', () => {
    subscribe('owner/repo1', 1, 'https://example.com/hook1', ['comment']);
    subscribe('owner/repo2', 2, 'https://example.com/hook2', ['merge']);

    const subs = listSubscriptions({ repo: 'owner/repo1' });
    expect(subs).toHaveLength(1);
    expect(subs[0].repo).toBe('owner/repo1');
  });

  it('should filter by active status', () => {
    const sub = subscribe('owner/repo', 1, 'https://example.com/hook', ['comment']);
    sub.active = false;

    const activeSubs = listSubscriptions({ activeOnly: true });
    expect(activeSubs).toHaveLength(0);

    const allSubs = listSubscriptions({ activeOnly: false });
    expect(allSubs).toHaveLength(1);
  });

  it('should default to activeOnly=true', () => {
    const sub = subscribe('owner/repo', 1, 'https://example.com/hook', ['comment']);
    sub.active = false;

    const subs = listSubscriptions();
    expect(subs).toHaveLength(0);
  });
});

describe('createSubscribePRTool', () => {
  it('should create a PiTool', () => {
    const tool = createSubscribePRTool();
    expect(tool.name).toBe('subscribe_pr');
    expect(tool.description).toBeTruthy();
  });

  it('should subscribe to a PR via tool invocation', async () => {
    const tool = createSubscribePRTool();
    const result = await tool.invoke({
      repo: 'owner/repo',
      prNumber: 123,
      webhookUrl: 'https://example.com/webhook',
      events: ['comment', 'merge'],
    });

    expect(result).toContain('owner/repo#123');
    expect(result).toContain('comment');
    expect(result).toContain('merge');
    expect(listSubscriptions()).toHaveLength(1);
  });
});

describe('createUnsubscribePRTool', () => {
  it('should create a PiTool', () => {
    const tool = createUnsubscribePRTool();
    expect(tool.name).toBe('unsubscribe_pr');
  });

  it('should unsubscribe via tool invocation', async () => {
    const sub = subscribe('owner/repo', 123, 'https://example.com/hook', ['comment']);
    expect(listSubscriptions()).toHaveLength(1);

    const tool = createUnsubscribePRTool();
    const result = await tool.invoke({ subscriptionId: sub.id });
    expect(result).toContain('Unsubscribed');
    expect(listSubscriptions()).toHaveLength(0);
  });

  it('should report not found for non-existent subscription', async () => {
    const tool = createUnsubscribePRTool();
    const result = await tool.invoke({ subscriptionId: 'non-existent' });
    expect(result).toContain('not found');
  });
});

describe('createListPRSubscriptionsTool', () => {
  it('should create a PiTool', () => {
    const tool = createListPRSubscriptionsTool();
    expect(tool.name).toBe('list_pr_subscriptions');
  });

  it('should list subscriptions via tool invocation', async () => {
    subscribe('owner/repo', 123, 'https://example.com/hook', ['comment', 'merge']);

    const tool = createListPRSubscriptionsTool();
    const result = await tool.invoke({});
    expect(result).toContain('PR Subscriptions');
    expect(result).toContain('owner/repo#123');
  });

  it('should report no subscriptions when empty', async () => {
    const tool = createListPRSubscriptionsTool();
    const result = await tool.invoke({});
    expect(result).toContain('No PR subscriptions');
  });

  it('should filter by repo', async () => {
    subscribe('owner/repo1', 1, 'https://example.com/hook1', ['comment']);
    subscribe('owner/repo2', 2, 'https://example.com/hook2', ['merge']);

    const tool = createListPRSubscriptionsTool();
    const result = await tool.invoke({ repo: 'owner/repo1' });
    expect(result).toContain('owner/repo1#1');
    expect(result).not.toContain('owner/repo2');
  });
});

describe('SUBSCRIBE_PR_DESCRIPTION', () => {
  it('should have a non-empty description', () => {
    expect(SUBSCRIBE_PR_DESCRIPTION).toBeTruthy();
    expect(SUBSCRIBE_PR_DESCRIPTION.length).toBeGreaterThan(50);
  });
});
