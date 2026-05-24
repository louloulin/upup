/**
 * Session Cleanup Manager - 基于Claude Code teamHelpers.ts设计
 * 
 * 核心机制:
 * - registerTeamForSessionCleanup: 标记会话创建的团队
 * - unregisterTeamForSessionCleanup: 取消标记
 * - cleanupSessionTeams: 清理当前会话创建的团队
 * 
 * 与Claude Code架构对比:
 * - Claude Code: 使用Set在内存中跟踪会话创建的团队
 * - Dexter: 使用团队名称模式匹配 (快速修复方案)
 */

import { info } from '../utils/logging/logger.js';

// 会话创建的团队集合
let sessionCreatedTeams = new Set<string>();

/**
 * Mark a team as created this session so it gets cleaned up on exit.
 */
export function registerTeamForSessionCleanup(teamName: string): void {
  sessionCreatedTeams.add(teamName);
}

/**
 * Remove a team from session cleanup tracking.
 * Called when a team is explicitly deleted.
 */
export function unregisterTeamForSessionCleanup(teamName: string): void {
  sessionCreatedTeams.delete(teamName);
}

/**
 * Get all teams created in this session.
 */
export function getSessionCreatedTeams(): Set<string> {
  return sessionCreatedTeams;
}

/**
 * Clean up all teams created this session that weren't explicitly deleted.
 * Should be called on process exit (SIGINT/SIGTERM).
 */
export async function cleanupSessionTeams(
  deleteFn: (name: string) => boolean
): Promise<void> {
  if (sessionCreatedTeams.size === 0) return;
  
  const teams = Array.from(sessionCreatedTeams);
  info('daemon', `Cleaning up ${teams.length} session teams`);
  
  for (const name of teams) {
    const ok = deleteFn(name);
    info('daemon', `cleanup: ${name} → ${ok ? 'deleted' : 'failed'}`);
  }
  
  sessionCreatedTeams.clear();
}

/**
 * Reset all session state (for testing)
 */
export function resetSessionCleanup(): void {
  sessionCreatedTeams.clear();
}
