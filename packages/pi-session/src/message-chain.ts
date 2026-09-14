/**
 * Message Chain Utilities
 *
 * Provides utilities for building and traversing message chains.
 * Based on Claude Code's parentUuid pattern for conversation threading.
 */

import type { SessionMessage } from './session-types.js';

export interface MessageChain {
  parentMap: Map<string, string | null>;
  rootMessages: string[];
  childrenMap: Map<string, string[]>;
}

export interface MessageNode {
  message: SessionMessage;
  depth: number;
  children: MessageNode[];
}

/**
 * Build a message chain from session messages.
 * Creates parent-child relationships for conversation threading.
 */
export function buildMessageChain(messages: SessionMessage[]): MessageChain {
  const parentMap = new Map<string, string | null>();
  const childrenMap = new Map<string, string[]>();
  const roots: string[] = [];

  // Initialize children map for all messages
  for (const msg of messages) {
    childrenMap.set(msg.id, []);
  }

  // Build parent-child relationships
  for (const msg of messages) {
    const parent = msg.parentUuid ?? null;
    parentMap.set(msg.id, parent);

    if (parent && childrenMap.has(parent)) {
      childrenMap.get(parent)!.push(msg.id);
    }

    if (!parent) {
      roots.push(msg.id);
    }
  }

  return { parentMap, rootMessages: roots, childrenMap };
}

/**
 * Get the depth of a message in the chain.
 * Root messages have depth 0, their children have depth 1, etc.
 */
export function getMessageDepth(messageId: string, chain: MessageChain): number {
  let depth = 0;
  let current = messageId;
  const visited = new Set<string>();

  while (chain.parentMap.get(current)) {
    if (visited.has(current)) break; // Prevent infinite loop in case of cycle
    visited.add(current);
    depth++;
    current = chain.parentMap.get(current)!;
  }

  return depth;
}

/**
 * Get all ancestor IDs of a message (from direct parent to root).
 */
export function getAncestorIds(messageId: string, chain: MessageChain): string[] {
  const ancestors: string[] = [];
  let current = messageId;
  const visited = new Set<string>();

  while (chain.parentMap.get(current)) {
    const parentId = chain.parentMap.get(current);
    if (parentId && !visited.has(parentId)) {
      ancestors.push(parentId);
      visited.add(parentId);
      current = parentId;
    } else {
      break;
    }
  }

  return ancestors;
}

/**
 * Get all descendant IDs of a message (all children, grandchildren, etc.).
 */
export function getDescendantIds(messageId: string, chain: MessageChain): string[] {
  const descendants: string[] = [];
  const queue = [...(chain.childrenMap.get(messageId) || [])];

  while (queue.length > 0) {
    const childId = queue.shift()!;
    descendants.push(childId);

    const children = chain.childrenMap.get(childId) || [];
    queue.push(...children);
  }

  return descendants;
}

/**
 * Build a tree structure from messages.
 * Useful for rendering hierarchical conversation views.
 */
export function buildMessageTree(
  messages: SessionMessage[],
  chain: MessageChain
): MessageNode[] {
  const messageMap = new Map<string, SessionMessage>();
  for (const msg of messages) {
    messageMap.set(msg.id, msg);
  }

  function buildNode(id: string, depth: number): MessageNode | null {
    const message = messageMap.get(id);
    if (!message) return null;

    const childIds = chain.childrenMap.get(id) || [];
    const children = childIds
      .map(childId => buildNode(childId, depth + 1))
      .filter((node): node is MessageNode => node !== null);

    return {
      message,
      depth,
      children,
    };
  }

  return chain.rootMessages
    .map(id => buildNode(id, 0))
    .filter((node): node is MessageNode => node !== null);
}

/**
 * Get the path from root to a specific message.
 */
export function getMessagePath(
  messageId: string,
  chain: MessageChain,
  messages: SessionMessage[]
): SessionMessage[] {
  const messageMap = new Map<string, SessionMessage>();
  for (const msg of messages) {
    messageMap.set(msg.id, msg);
  }

  const path: SessionMessage[] = [];
  const ancestorIds = getAncestorIds(messageId, chain);

  // Add ancestors in order (oldest first)
  for (const ancestorId of ancestorIds.reverse()) {
    const ancestor = messageMap.get(ancestorId);
    if (ancestor) path.push(ancestor);
  }

  // Add the message itself
  const message = messageMap.get(messageId);
  if (message) path.push(message);

  return path;
}

/**
 * Check if a message is a descendant of another message.
 */
export function isDescendantOf(
  childId: string,
  ancestorId: string,
  chain: MessageChain
): boolean {
  const ancestorIds = getAncestorIds(childId, chain);
  return ancestorIds.includes(ancestorId);
}

/**
 * Get the sibling messages (same parent).
 */
export function getSiblings(messageId: string, chain: MessageChain): string[] {
  const parentId = chain.parentMap.get(messageId);
  if (!parentId) return [];

  return chain.childrenMap.get(parentId)?.filter(id => id !== messageId) || [];
}

/**
 * Find the root message for any message in the chain.
 */
export function findRoot(messageId: string, chain: MessageChain): string | null {
  let current: string | null = messageId;
  const visited = new Set<string>();

  while (current && !visited.has(current)) {
    visited.add(current);
    const parent = chain.parentMap.get(current);
    if (!parent) return current;
    current = parent;
  }

  return null; // Cycle detected
}

/**
 * Get the direct child count of a message.
 */
export function getChildCount(messageId: string, chain: MessageChain): number {
  return chain.childrenMap.get(messageId)?.length || 0;
}

/**
 * Check if a chain has any children (is not a leaf).
 */
export function hasChildren(messageId: string, chain: MessageChain): boolean {
  return getChildCount(messageId, chain) > 0;
}

/**
 * Create an empty chain.
 */
export function emptyChain(): MessageChain {
  return {
    parentMap: new Map(),
    rootMessages: [],
    childrenMap: new Map(),
  };
}