/**
 * Base Approval Request Component (pi-tui version)
 *
 * 基于 pi-tui 的基础授权请求组件
 */

import { Container, Text, getKeybindings } from '@earendil-works/pi-tui';
import type { ApprovalDecision } from '@upup/agent-runtime';
import { getToolDangerLevel, getApprovalConfig, isHardDenyCommand } from '@upup/services-core/permissions';
import { theme } from '@upup/tui-renderer/theme';

// ============================================================================
// Types
// ============================================================================

export interface ApprovalRequestData {
  toolName: string
  args: Record<string, unknown>
  reason?: string
  suggestions?: string[]
}

export interface ApprovalRequestOptions {
  onApprove: (decision: ApprovalDecision) => void
  onDeny: () => void
  enableFeedback?: boolean
}

// ============================================================================
// Utility Functions
// ============================================================================

export function formatToolLabel(tool: string): string {
  return tool
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function formatDangerLevel(level: 'low' | 'medium' | 'high'): string {
  switch (level) {
    case 'low': return theme.success('✓');
    case 'medium': return theme.warning('⚠');
    case 'high': return theme.error('🔴');
    default: return '?';
  }
}

export function getDangerDescription(toolName: string, args: Record<string, unknown>): string | null {
  const level = getToolDangerLevel(toolName);
  
  if (level === 'high') {
    if (toolName === 'Bash' && args.command) {
      const command = args.command as string;
      if (isHardDenyCommand(command)) {
        return 'DANGER: This command will cause permanent data loss!';
      }
      if (/sudo\s+rm/i.test(command)) {
        return theme.warning('This command uses sudo and may permanently delete files.');
      }
      if (/curl\s+.*\|\s*(sh|bash|perl|python)/i.test(command)) {
        return theme.warning('This command downloads and executes code from the internet.');
      }
      if (/pip\s+install/i.test(command) && process.platform !== 'win32') {
        return theme.warning('This will install Python packages.');
      }
    }
  }
  
  if (level === 'medium') {
    if (toolName === 'Write' || toolName === 'Edit') {
      const path = (args.file_path || args.path || args.file) as string;
      if (path) {
        const lower = path.toLowerCase();
        if (lower.includes('.ssh/') || lower.includes('.aws/') || lower.includes('credentials')) {
          return theme.warning('This path may contain sensitive data!');
        }
      }
    }
  }
  
  return null;
}

// ============================================================================
// Base Component (pi-tui Container)
// ============================================================================

export abstract class BaseApprovalRequest extends Container {
  protected data: ApprovalRequestData;
  protected options: ApprovalRequestOptions;
  protected config = getApprovalConfig();
  
  constructor(data: ApprovalRequestData, options: ApprovalRequestOptions) {
    super();
    this.data = data;
    this.options = options;
  }
  
  getToolName(): string {
    return this.data.toolName;
  }
  
  getDangerLevel(): 'low' | 'medium' | 'high' {
    return getToolDangerLevel(this.data.toolName);
  }
  
  shouldShowDangerWarning(): boolean {
    return this.config.ui.showDangerWarning && this.getDangerLevel() === 'high';
  }
  
  isFeedbackEnabled(): boolean {
    return this.config.ui.enableFeedback;
  }
  
  handleInput(keyData: string): void {
    const kb = getKeybindings();
    if (kb.matches(keyData, 'tui.select.cancel')) {
      this.options.onDeny();
    }
  }
}

// ============================================================================
// Simple Text-based Approval (for fallback)
// ============================================================================

export class SimpleApprovalRequest extends Container {
  private selector: any;
  private tool: string;
  private args: Record<string, unknown>;
  
  constructor(tool: string, args: Record<string, unknown>, onSelect: (decision: ApprovalDecision) => void) {
    super();
    this.tool = tool;
    this.args = args;
    
    const { createSimpleApprovalSelector } = require('./select-list.js');
    this.selector = createSimpleApprovalSelector(onSelect);
    
    this.renderContent();
  }
  
  private renderContent(): void {
    const width = Math.max(20, process.stdout.columns ?? 80);
    const border = theme.warning('─'.repeat(width));
    const level = getToolDangerLevel(this.tool);
    const danger = formatDangerLevel(level);
    
    this.addChild(new Text(border, 0, 0));
    this.addChild(new Text(theme.warning(theme.bold('⚠️  Permission Required')), 0, 0));
    this.addChild(new Text(`${danger} ${formatToolLabel(this.tool)}`, 0, 0));
    
    // Tool-specific info
    if (this.tool === 'Bash' && this.args.command) {
      const cmd = this.args.command as string;
      this.addChild(new Text(`Command: ${cmd.substring(0, 60)}${cmd.length > 60 ? '...' : ''}`, 0, 0));
    } else if ((this.tool === 'Write' || this.tool === 'Edit') && (this.args.file_path || this.args.path)) {
      const path = (this.args.file_path || this.args.path) as string;
      this.addChild(new Text(`Path: ${path}`, 0, 0));
    }
    
    // Danger warning
    const warning = getDangerDescription(this.tool, this.args);
    if (warning) {
      this.addChild(new Text(warning, 0, 0));
    }
    
    this.addChild(new Text('', 0, 0));
    this.addChild(this.selector);
    this.addChild(new Text('', 0, 0));
    this.addChild(new Text(theme.muted('Enter to confirm · esc to deny'), 0, 0));
    this.addChild(new Text(border, 0, 0));
  }
  
  handleInput(keyData: string): void {
    if (this.selector && typeof this.selector.handleInput === 'function') {
      this.selector.handleInput(keyData);
    }
  }
}