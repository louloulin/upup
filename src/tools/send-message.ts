/**
 * Send Message Tool - Agent-to-agent messaging
 *
 * Allows agents to send messages to other agents, tasks, or broadcast to all.
 * Uses the TeamCoordinator's messaging system.
 *
 * Reference: Claude Code's task system sendMessage
 */

import { z } from 'zod';
import { PiTool } from '../runtime/pi/tool.js';
import { getTeamCoordinator } from '../subagent/team-coordination.js';

// ============================================================================
// Schema & Description
// ============================================================================

export const SendMessageSchema = z.object({
  /** Recipient ID ('all' for broadcast) */
  to: z.string().describe('Recipient ID (agent ID, task ID, or "all" for broadcast)'),
  /** Message content */
  content: z.string().describe('Message content to send'),
  /** Message type */
  type: z.enum(['task', 'status', 'request', 'response', 'broadcast']).optional().default('request').describe('Message type'),
  /** Related task ID */
  task_id: z.string().optional().describe('Related task ID'),
  /** Sender ID (defaults to 'main-agent') */
  from: z.string().optional().default('main-agent').describe('Sender ID'),
});

export type SendMessageInput = z.infer<typeof SendMessageSchema>;

export const SEND_MESSAGE_DESCRIPTION = `
Send a message to another agent, task, or broadcast to all.

Use this to:
- Communicate between agents in a team
- Send task assignments or updates
- Request information from another agent
- Report status back to coordinator
- Broadcast to all team members

Examples:
- Send a task to a specific agent
- Request progress update from a worker agent
- Broadcast status update to all agents
- Reply to a previous message`;

// ============================================================================
// Message Store (standalone, for when TeamCoordinator is not initialized)
// ============================================================================

export interface AgentMessage {
  id: string;
  from: string;
  to: string;
  type: 'task' | 'status' | 'request' | 'response' | 'broadcast';
  content: string;
  timestamp: number;
  taskId?: string;
  read: boolean;
}

class AgentMessageStore {
  private messages: AgentMessage[] = [];
  private maxMessages = 1000;

  send(message: Omit<AgentMessage, 'id' | 'timestamp' | 'read'>): AgentMessage {
    const fullMessage: AgentMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
      read: false,
    };

    this.messages.push(fullMessage);

    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(-500);
    }

    return fullMessage;
  }

  getMessages(filter?: { to?: string; from?: string; unread?: boolean; limit?: number }): AgentMessage[] {
    let filtered = [...this.messages];

    if (filter?.to) {
      filtered = filtered.filter(m => m.to === filter.to || m.to === 'all');
    }
    if (filter?.from) {
      filtered = filtered.filter(m => m.from === filter.from);
    }
    if (filter?.unread) {
      filtered = filtered.filter(m => !m.read);
    }

    filtered.sort((a, b) => b.timestamp - a.timestamp);

    if (filter?.limit) {
      filtered = filtered.slice(0, filter.limit);
    }

    return filtered;
  }

  markAsRead(messageId: string): boolean {
    const message = this.messages.find(m => m.id === messageId);
    if (message) {
      message.read = true;
      return true;
    }
    return false;
  }

  markAllRead(recipient: string): number {
    let count = 0;
    for (const m of this.messages) {
      if ((m.to === recipient || m.to === 'all') && !m.read) {
        m.read = true;
        count++;
      }
    }
    return count;
  }

  getUnreadCount(recipient: string): number {
    return this.messages.filter(m => (m.to === recipient || m.to === 'all') && !m.read).length;
  }

  clear(): void {
    this.messages = [];
  }

  count(): number {
    return this.messages.length;
  }
}

// Singleton store for standalone operation
const messageStore = new AgentMessageStore();

// ============================================================================
// Tool Factory
// ============================================================================

export function createSendMessageTool(): PiTool {
  return new PiTool({
    name: 'send_message',
    description: SEND_MESSAGE_DESCRIPTION,
    schema: SendMessageSchema,
    async func(input): Promise<string> {
      try {
        const message = messageStore.send({
          from: input.from || 'main-agent',
          to: input.to,
          type: input.type || 'request',
          content: input.content,
          taskId: input.task_id,
        });

        // Also try to send via TeamCoordinator if available
        try {
          const coordinator = getTeamCoordinator();
          coordinator.sendMessage({
            from: input.from || 'main-agent',
            to: input.to,
            type: input.type || 'request',
            content: input.content,
            taskId: input.task_id,
          });
        } catch {
          // TeamCoordinator not initialized, using standalone store
        }

        let details = `Message sent successfully.\n\n` +
          `Message ID: ${message.id}\n` +
          `To: ${message.to}\n` +
          `Type: ${message.type}\n` +
          `Timestamp: ${new Date(message.timestamp).toISOString()}`;

        if (message.taskId) {
          details += `\nTask ID: ${message.taskId}`;
        }

        details += `\n\nContent preview: ${message.content.slice(0, 100)}${message.content.length > 100 ? '...' : ''}`;

        return details;
      } catch (err) {
        return `Failed to send message: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });
}

// ============================================================================
// Module Exports
// ============================================================================

export { messageStore };

export function getMessageStore(): AgentMessageStore {
  return messageStore;
}

export function resetMessageStore(): void {
  messageStore.clear();
}
