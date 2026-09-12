/**
 * SubscribePR Tool - Subscribe to GitHub PR events via webhook
 *
 * Allows agents to subscribe to PR events (comments, reviews, merges, etc.)
 * and receive notifications via webhook.
 */

import { z } from 'zod';
import { PiTool } from '../../runtime/pi/tool.js';

// ============================================================================
// Types & Store
// ============================================================================

export interface PRSubscription {
  id: string;
  repo: string;
  prNumber: number;
  webhookUrl: string;
  events: string[];
  createdAt: number;
  active: boolean;
}

const subscriptionStore: Map<string, PRSubscription> = new Map();

// ============================================================================
// Schemas
// ============================================================================

export const SubscribePRSchema = z.object({
  /** GitHub repository (e.g., "owner/repo") */
  repo: z.string().min(1).max(200).describe('GitHub repository in "owner/repo" format'),
  /** PR number */
  prNumber: z.number().int().positive().describe('Pull request number'),
  /** Webhook URL to receive notifications */
  webhookUrl: z.string().url().describe('Webhook URL for receiving PR event notifications'),
  /** Events to subscribe to */
  events: z.array(
    z.enum(['comment', 'review', 'merge', 'close', 'reopen', 'label', 'assign', 'ready_for_review'])
  ).min(1).describe('List of PR events to subscribe to'),
});

export const UnsubscribePRSchema = z.object({
  /** Subscription ID to remove */
  subscriptionId: z.string().min(1).describe('Subscription ID to unsubscribe'),
});

export const ListPRSubscriptionsSchema = z.object({
  /** Filter by repo */
  repo: z.string().optional().describe('Filter by repository (owner/repo)'),
  /** Filter by active status */
  activeOnly: z.boolean().optional().describe('Only show active subscriptions (default: true)'),
});

// ============================================================================
// Subscription Management
// ============================================================================

/**
 * Subscribe to PR events
 */
export function subscribe(
  repo: string,
  prNumber: number,
  webhookUrl: string,
  events: string[],
): PRSubscription {
  const id = `pr-sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const subscription: PRSubscription = {
    id,
    repo,
    prNumber,
    webhookUrl,
    events,
    createdAt: Date.now(),
    active: true,
  };
  subscriptionStore.set(id, subscription);
  return subscription;
}

/**
 * Unsubscribe from PR events
 */
export function unsubscribe(subscriptionId: string): boolean {
  const sub = subscriptionStore.get(subscriptionId);
  if (!sub) return false;
  sub.active = false;
  subscriptionStore.delete(subscriptionId);
  return true;
}

/**
 * List all subscriptions, optionally filtered
 */
export function listSubscriptions(filters?: {
  repo?: string;
  activeOnly?: boolean;
}): PRSubscription[] {
  let subs = Array.from(subscriptionStore.values());

  if (filters?.repo) {
    subs = subs.filter(s => s.repo === filters.repo);
  }
  if (filters?.activeOnly !== false) {
    subs = subs.filter(s => s.active);
  }
  return subs;
}

/**
 * Clear all subscriptions (for testing)
 */
export function clearSubscriptions(): void {
  subscriptionStore.clear();
}

// ============================================================================
// Tool Descriptions
// ============================================================================

export const SUBSCRIBE_PR_DESCRIPTION = `
Subscribe to GitHub Pull Request events via webhook.

Use this when:
- Monitoring PRs for review feedback
- Waiting for PR merges to trigger follow-up actions
- Tracking PR status changes

Events available:
- comment: New comments on the PR
- review: Review submissions (approve, request changes, comment)
- merge: PR is merged
- close: PR is closed without merging
- reopen: PR is reopened
- label: Labels are added or removed
- assign: Assignees are changed
- ready_for_review: Draft PR is marked ready

The webhook receives POST requests with event details as JSON payload.`;

export const UNSUBSCRIBE_PR_DESCRIPTION = `
Unsubscribe from a PR subscription.

Use this to stop receiving notifications for a previously subscribed PR.`;

export const LIST_PR_SUBSCRIPTIONS_DESCRIPTION = `
List active PR subscriptions.

Use this to:
- Check which PRs are being monitored
- Verify webhook URLs
- Review subscribed events

Returns all subscriptions with their details.`;

// ============================================================================
// Tool Factories
// ============================================================================

export function createSubscribePRTool(): PiTool {
  return new PiTool({
    name: 'subscribe_pr',
    description: SUBSCRIBE_PR_DESCRIPTION,
    schema: SubscribePRSchema,
    async func(input): Promise<string> {
      const sub = subscribe(input.repo, input.prNumber, input.webhookUrl, input.events);
      return `Subscribed to PR ${input.repo}#${input.prNumber}.\n` +
        `ID: ${sub.id}\n` +
        `Events: ${input.events.join(', ')}\n` +
        `Webhook: ${input.webhookUrl}`;
    },
  });
}

export function createUnsubscribePRTool(): PiTool {
  return new PiTool({
    name: 'unsubscribe_pr',
    description: UNSUBSCRIBE_PR_DESCRIPTION,
    schema: UnsubscribePRSchema,
    async func(input): Promise<string> {
      const removed = unsubscribe(input.subscriptionId);
      if (removed) {
        return `Unsubscribed: ${input.subscriptionId}`;
      }
      return `Subscription not found: ${input.subscriptionId}`;
    },
  });
}

export function createListPRSubscriptionsTool(): PiTool {
  return new PiTool({
    name: 'list_pr_subscriptions',
    description: LIST_PR_SUBSCRIPTIONS_DESCRIPTION,
    schema: ListPRSubscriptionsSchema,
    async func(input): Promise<string> {
      const subs = listSubscriptions({
        repo: input.repo,
        activeOnly: input.activeOnly ?? true,
      });

      if (subs.length === 0) {
        return 'No PR subscriptions found.';
      }

      const lines = [`PR Subscriptions (${subs.length}):\n`];
      for (const sub of subs) {
        lines.push(`  ${sub.id}: ${sub.repo}#${sub.prNumber}`);
        lines.push(`    Events: ${sub.events.join(', ')}`);
        lines.push(`    Webhook: ${sub.webhookUrl}`);
        lines.push(`    Created: ${new Date(sub.createdAt).toLocaleString()}`);
        lines.push('');
      }
      return lines.join('\n');
    },
  });
}
