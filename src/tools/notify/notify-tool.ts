/**
 * PushNotificationTool - Send notifications via webhook, Feishu, or email
 *
 * Allows agents to send alerts and notifications through various channels.
 */

import { z } from 'zod';
import { PiTool } from '../../runtime/pi/tool.js';

// ============================================================================
// Types & Store
// ============================================================================

export interface Notification {
  id: string;
  channel: string;
  title: string;
  message: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  timestamp: number;
  status: 'sent' | 'failed' | 'pending';
  error?: string;
}

const notificationLog: Notification[] = [];
const MAX_LOG = 100;

// Webhook sender (no external deps)
async function sendWebhook(url: string, payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ============================================================================
// Schemas
// ============================================================================

export const NotifySchema = z.object({
  /** Notification channel */
  channel: z.enum(['webhook', 'feishu', 'log']).describe('Notification channel'),
  /** Webhook URL (required for webhook/feishu) */
  url: z.string().url().optional().describe('Webhook URL (required for webhook and feishu channels)'),
  /** Notification title/subject */
  title: z.string().min(1).max(200).describe('Notification title'),
  /** Notification message body */
  message: z.string().min(1).max(5000).describe('Notification message'),
  /** Severity level */
  level: z.enum(['info', 'warning', 'error', 'critical']).optional().describe('Severity level (default: info)'),
});

export const NotifyListSchema = z.object({
  /** Filter by channel */
  channel: z.string().optional().describe('Filter by channel name'),
  /** Filter by level */
  level: z.enum(['info', 'warning', 'error', 'critical']).optional().describe('Filter by severity level'),
  /** Maximum results */
  limit: z.number().min(1).max(50).optional().describe('Maximum results (default: 20)'),
});

// ============================================================================
// Tool Descriptions
// ============================================================================

export const NOTIFY_DESCRIPTION = `
Send a push notification via webhook, Feishu, or log.

Use this when:
- Alerting about critical events (trade signals, errors)
- Sending notifications to external systems
- Logging important milestones

Channels:
- webhook: Generic HTTP POST webhook
- feishu: Feishu/Lark bot webhook
- log: Internal notification log (no external call)

For webhook/feishu, provide the webhook URL. The message is sent as JSON.

Examples:
- Log alert: channel: 'log', title: 'Trade Signal', message: 'AAPL BUY signal detected'
- Webhook: channel: 'webhook', url: 'https://hooks.example.com/...', title: 'Alert'`;

export const NOTIFY_LIST_DESCRIPTION = `
List recent notifications from the notification log.

Use this when:
- Checking notification history
- Verifying notifications were sent
- Debugging notification delivery

Returns the most recent notifications with status and timestamps.`;

// ============================================================================
// Tool Factories
// ============================================================================

export function createNotifyTool(): PiTool {
  return new PiTool({
    name: 'notify',
    description: NOTIFY_DESCRIPTION,
    schema: NotifySchema,
    async func(input): Promise<string> {
      const level = input.level ?? 'info';
      const notification: Notification = {
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        channel: input.channel,
        title: input.title,
        message: input.message,
        level,
        timestamp: Date.now(),
        status: 'pending',
      };

      try {
        if (input.channel === 'webhook') {
          if (!input.url) {
            notification.status = 'failed';
            notification.error = 'URL required for webhook channel';
            notificationLog.push(notification);
            return `Error: URL required for webhook channel.`;
          }
          const result = await sendWebhook(input.url, {
            title: input.title,
            message: input.message,
            level,
            timestamp: new Date().toISOString(),
          });
          notification.status = result.ok ? 'sent' : 'failed';
          if (result.error) notification.error = result.error;
        } else if (input.channel === 'feishu') {
          if (!input.url) {
            notification.status = 'failed';
            notification.error = 'URL required for feishu channel';
            notificationLog.push(notification);
            return `Error: URL required for feishu channel.`;
          }
          const result = await sendWebhook(input.url, {
            msg_type: 'text',
            content: { text: `[${level.toUpperCase()}] ${input.title}\n\n${input.message}` },
          });
          notification.status = result.ok ? 'sent' : 'failed';
          if (result.error) notification.error = result.error;
        } else {
          // log channel - always succeeds
          notification.status = 'sent';
        }
      } catch (err) {
        notification.status = 'failed';
        notification.error = err instanceof Error ? err.message : String(err);
      }

      notificationLog.push(notification);
      if (notificationLog.length > MAX_LOG) {
        notificationLog.splice(0, notificationLog.length - MAX_LOG);
      }

      if (notification.status === 'sent') {
        return `Notification sent via ${input.channel}.\nID: ${notification.id}\nLevel: ${level}\nTitle: ${input.title}`;
      }
      return `Notification failed via ${input.channel}.\nError: ${notification.error}`;
    },
  });
}

export function createNotifyListTool(): PiTool {
  return new PiTool({
    name: 'notify_list',
    description: NOTIFY_LIST_DESCRIPTION,
    schema: NotifyListSchema,
    async func(input): Promise<string> {
      let filtered = [...notificationLog];

      if (input.channel) {
        filtered = filtered.filter(n => n.channel === input.channel);
      }
      if (input.level) {
        filtered = filtered.filter(n => n.level === input.level);
      }

      filtered.sort((a, b) => b.timestamp - a.timestamp);

      const limit = input.limit ?? 20;
      const shown = filtered.slice(0, limit);

      if (shown.length === 0) {
        return `No notifications found.`;
      }

      const lines = [`Notifications (${shown.length}):\n`];
      for (const n of shown) {
        const statusIcon = n.status === 'sent' ? '✅' : '❌';
        const levelIcon = n.level === 'critical' ? '🔴' : n.level === 'error' ? '🟠' : n.level === 'warning' ? '🟡' : '🟢';
        lines.push(`${statusIcon} ${levelIcon} [${n.channel}] ${n.title}`);
        lines.push(`   ${new Date(n.timestamp).toLocaleString()} | ${n.status}${n.error ? ` (${n.error})` : ''}`);
        lines.push('');
      }

      return lines.join('\n');
    },
  });
}

// ============================================================================
// Module Exports
// ============================================================================
