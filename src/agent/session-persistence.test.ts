/**
 * Session Persistence Test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'bun:test';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { SessionManager, getSessionManager, resetSessionManager } from './session-persistence.js';

describe('SessionManager', () => {
  const testDir = join(tmpdir(), 'test-sessions');

  beforeEach(() => {
    resetSessionManager();
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  describe('startSession', () => {
    it('should create a new session', async () => {
      const manager = new SessionManager();
      const sessionId = await manager.startSession();
      
      expect(sessionId).toMatch(/^session_/);
      expect(manager.getSessionId()).toBe(sessionId);
    });

    it('should include metadata', async () => {
      const manager = new SessionManager();
      await manager.startSession({ model: 'claude-3-5' });
      
      const session = manager.getSession();
      expect(session?.metadata.model).toBe('claude-3-5');
      expect(session?.metadata.queryCount).toBe(1);
    });
  });

  describe('tool approval/denial', () => {
    it('should approve tools', async () => {
      const manager = new SessionManager();
      await manager.startSession();
      
      manager.approveTool('bash');
      expect(manager.isToolApproved('bash')).toBe(true);
      expect(manager.isToolDenied('bash')).toBe(false);
    });

    it('should deny tools', async () => {
      const manager = new SessionManager();
      await manager.startSession();
      
      manager.denyTool('dangerous');
      expect(manager.isToolDenied('dangerous')).toBe(true);
    });

    it('should track tool call counts', async () => {
      const manager = new SessionManager();
      await manager.startSession();
      
      manager.recordToolCall('read');
      manager.recordToolCall('read');
      manager.recordToolCall('write');
      
      const session = manager.getSession();
      expect(session?.toolCallCounts['read']).toBe(2);
      expect(session?.toolCallCounts['write']).toBe(1);
    });
  });

  describe('transcript', () => {
    it('should add messages to transcript', async () => {
      const manager = new SessionManager();
      await manager.startSession();
      
      manager.addTranscriptMessage('user', 'Hello world');
      manager.addTranscriptMessage('assistant', 'Hi there!');
      
      const transcript = manager.getTranscript();
      expect(transcript.length).toBe(2);
      expect(transcript[0].role).toBe('user');
      expect(transcript[0].content).toBe('Hello world');
    });

    it('should add tool messages with metadata', async () => {
      const manager = new SessionManager();
      await manager.startSession();
      
      manager.addTranscriptMessage('tool', 'read /etc/passwd', {
        toolName: 'read',
        toolResult: 'file content',
      });
      
      const transcript = manager.getTranscript();
      expect(transcript[0].toolName).toBe('read');
      expect(transcript[0].toolResult).toBe('file content');
    });

    it('should update transcript stats', async () => {
      const manager = new SessionManager();
      await manager.startSession();
      
      manager.addTranscriptMessage('user', 'Hello');
      manager.addTranscriptMessage('assistant', 'Hi');
      manager.addTranscriptMessage('tool', 'bash ls');
      
      const session = manager.getSession();
      expect(session?.transcriptStats?.userMessageCount).toBe(1);
      expect(session?.transcriptStats?.assistantMessageCount).toBe(1);
      expect(session?.transcriptStats?.toolMessageCount).toBe(1);
    });
  });

  describe('compressTranscript', () => {
    it('should compress old messages', async () => {
      const manager = new SessionManager();
      await manager.startSession();
      
      // Add many messages
      for (let i = 0; i < 60; i++) {
        manager.addTranscriptMessage('user', `Message ${i}`);
      }
      
      manager.compressTranscript(20);
      
      const transcript = manager.getTranscript();
      expect(transcript.length).toBeLessThan(60);
      expect(transcript[0].compressed).toBe(true);
    });
  });

  describe('deduplicateTranscript', () => {
    it('should remove consecutive duplicates', async () => {
      const manager = new SessionManager();
      await manager.startSession();
      
      manager.addTranscriptMessage('user', 'Hello');
      manager.addTranscriptMessage('user', 'Hello');
      manager.addTranscriptMessage('assistant', 'Hi');
      manager.addTranscriptMessage('user', 'Hello');
      
      manager.deduplicateTranscript();
      
      const transcript = manager.getTranscript();
      expect(transcript.length).toBe(3);
    });
  });

  describe('exportTranscript', () => {
    it('should export transcript as readable format', async () => {
      const manager = new SessionManager();
      await manager.startSession();
      
      manager.addTranscriptMessage('user', 'Hello');
      manager.addTranscriptMessage('assistant', 'Hi there');
      
      const exported = manager.exportTranscript();
      expect(exported).toContain('USER');
      expect(exported).toContain('Hello');
      expect(exported).toContain('ASSISTANT');
      expect(exported).toContain('Hi there');
    });
  });

  describe('updateTokens and updateIterations', () => {
    it('should track tokens and iterations', async () => {
      const manager = new SessionManager();
      await manager.startSession();
      
      manager.updateTokens(5000);
      manager.updateIterations(10);
      
      const session = manager.getSession();
      expect(session?.metadata.totalTokens).toBe(5000);
      expect(session?.metadata.totalIterations).toBe(10);
    });
  });
});
