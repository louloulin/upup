/**
 * Bash Approval Request Component (pi-tui native + BorderBox)
 *
 * 基于 pi-tui 的 Bash 命令专用授权请求组件
 * 使用 BorderBox 组件替代手动边框绘制
 */

import { Container, Text, Spacer, type Component } from '@earendil-works/pi-tui';
import { BorderBox } from '../BorderBox.js';
import type { ApprovalDecision } from '@upup/pi-event-adapter';
import { isHardDenyCommand, getApprovalConfig } from '../../utils/permissions/index.js';
import { theme } from '../../theme.js';
import type { ApprovalRequestData, ApprovalRequestOptions } from './BaseApprovalRequest.js';

export class BashApprovalRequest extends Container {
  private command: string;
  private selector: any;
  private onSelect: (decision: ApprovalDecision) => void;
  private headerBox: BorderBox;
  private contentBox: BorderBox;
  private hintText: Text;

  constructor(data: ApprovalRequestData, options: ApprovalRequestOptions) {
    super();
    this.command = (data.args.command as string) || '';
    this.onSelect = options.onApprove;

    const { createSimpleApprovalSelector } = require('../select-list.js');
    this.selector = createSimpleApprovalSelector(options.onApprove);

    // Create UI components
    this.headerBox = this.createHeaderBox();
    this.contentBox = this.createContentBox();
    this.hintText = new Text(
      theme.muted('Enter to confirm · Esc to deny'),
      0,
      0
    );

    // Add children
    this.addChild(this.headerBox);
    this.addChild(new Spacer(1));
    this.addChild(this.contentBox);
    this.addChild(new Spacer(1));
    this.addChild(this.selector);
    this.addChild(new Spacer(1));
    this.addChild(this.hintText);
  }

  private getCommandBase(): string {
    const parts = this.command.split(/\s+/);
    return parts[0] || 'unknown';
  }

  private isReadOnlyCommand(): boolean {
    const cmd = this.command.toLowerCase();
    const readOnlyPatterns = [
      /^ls/, /^cat/, /^head/, /^tail/, /^grep/,
      /^find/, /^pwd/, /^echo/, /^ps/, /^git\s+(status|log|show|diff|branch)/i,
    ];
    return readOnlyPatterns.some(p => p.test(cmd));
  }

  private isDangerousCommand(): boolean {
    const cmd = this.command.toLowerCase();
    const dangerousPatterns = [
      /^rm\s+-rf/i, /^sudo\s+rm/i, /^dd\s+/i, /^mkfs/i,
      /^fdisk/i, /curl\s+.*\|\s*(sh|bash)/i, /wget\s+.*\|\s*(sh|bash)/i,
      /:\(\)\{:\|:&\};:/,
    ];
    return dangerousPatterns.some(p => p.test(cmd));
  }

  private createHeaderBox(): BorderBox {
    const children: Component[] = [
      new Text(theme.warning(theme.bold('⚠️  Permission Required - Bash Command')), 0, 0),
    ];
    return new BorderBox(children, { style: 'single', paddingX: 1, paddingY: 0 });
  }

  private createContentBox(): BorderBox {
    const children: Component[] = [];
    const readonly = this.isReadOnlyCommand();
    const dangerous = this.isDangerousCommand() || isHardDenyCommand(this.command);

    // Command display
    const truncatedCmd = this.command.length > 70
      ? this.command.substring(0, 67) + '...'
      : this.command;
    children.push(new Text(`Command: ${theme.primary(truncatedCmd)}`, 0, 0));
    children.push(new Text(`Base: ${this.getCommandBase()}`, 0, 0));

    // Read-only indicator
    if (readonly) {
      children.push(new Text(theme.muted('[Read-only operation]'), 0, 0));
    }

    // Danger warning
    if (dangerous) {
      children.push(new Text('', 0, 0));
      children.push(new Text(theme.error('🔴 DANGER: This command may be destructive!'), 0, 0));
    }

    // Specific warnings
    if (/sudo\s+rm/i.test(this.command)) {
      children.push(new Text(theme.warning('Warning: Uses sudo, may permanently delete files'), 0, 0));
    }
    if (/curl\s+.*\|\s*(sh|bash)/i.test(this.command)) {
      children.push(new Text(theme.warning('Warning: Downloads and executes code from internet'), 0, 0));
    }

    return new BorderBox(children, { style: 'single', paddingX: 1, paddingY: 0 });
  }

  handleInput(keyData: string): void {
    if (this.selector && typeof this.selector.handleInput === 'function') {
      this.selector.handleInput(keyData);
    }
  }
}

export function createBashApprovalRequest(data: ApprovalRequestData, options: ApprovalRequestOptions): BashApprovalRequest {
  return new BashApprovalRequest(data, options);
}
