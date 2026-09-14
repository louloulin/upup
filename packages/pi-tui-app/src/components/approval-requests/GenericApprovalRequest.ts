/**
 * Generic Approval Request Component (pi-tui version)
 *
 * 基于 pi-tui 的通用授权请求组件 (fallback)
 * 使用 BorderBox 组件替代手动边框绘制
 */

import { Container, Text, Spacer } from '@earendil-works/pi-tui';
import { BorderBox } from '../BorderBox.js';
import type { ApprovalDecision } from '@upup/pi-event-adapter';
import { getToolDangerLevel } from '../../permissions/index.js';
import { theme } from '@upup/utils';
import type { ApprovalRequestData, ApprovalRequestOptions } from './BaseApprovalRequest.js';

export class GenericApprovalRequest extends Container {
  private toolName: string;
  private args: Record<string, unknown>;
  private selector: any;
  private headerBox: BorderBox;
  private contentBox: BorderBox;
  private hintText: Text;

  constructor(data: ApprovalRequestData, options: ApprovalRequestOptions) {
    super();
    this.toolName = data.toolName;
    this.args = data.args;

    const { createSimpleApprovalSelector } = require('../select-list.js');
    this.selector = createSimpleApprovalSelector(options.onApprove);

    // Create UI components using BorderBox
    const level = getToolDangerLevel(this.toolName);
    const dangerIcon = level === 'high' ? '🔴' : level === 'medium' ? '⚠️' : '✅';
    const levelText = level === 'high' ? 'HIGH' : level === 'medium' ? 'MEDIUM' : 'LOW';

    // Header box with warning style
    this.headerBox = new BorderBox(
      [new Text(theme.warning(theme.bold(`${dangerIcon}  Permission Required`)))],
      { style: 'single', paddingX: 1, paddingY: 0 }
    );

    // Content box
    const formattedTool = this.toolName.split('_').map(
      (w: string) => w.charAt(0).toUpperCase() + w.slice(1)
    ).join(' ');

    const contentItems: Text[] = [
      new Text(`Tool: ${theme.primary(formattedTool)}`, 0, 0),
      new Text(`Danger Level: ${theme.warning(levelText)}`, 0, 0),
    ];

    // Show args summary
    const argsKeys = Object.keys(this.args);
    if (argsKeys.length > 0) {
      contentItems.push(new Text(`Arguments: ${argsKeys.join(', ')}`, 0, 0));
    }

    // Reason if provided
    if (this.args.reason) {
      contentItems.push(new Text('', 0, 0));
      contentItems.push(new Text(theme.muted(`Reason: ${this.args.reason}`), 0, 0));
    }

    this.contentBox = new BorderBox(contentItems, { style: 'single', paddingX: 1, paddingY: 0 });

    // Hint text
    this.hintText = new Text(
      theme.muted('Enter to confirm · Esc to deny'),
      0,
      0
    );

    // Add children in order
    this.addChild(this.headerBox);
    this.addChild(new Spacer(1));
    this.addChild(this.contentBox);
    this.addChild(new Spacer(1));
    this.addChild(this.selector);
    this.addChild(new Spacer(1));
    this.addChild(this.hintText);
  }

  handleInput(keyData: string): void {
    if (this.selector && typeof this.selector.handleInput === 'function') {
      this.selector.handleInput(keyData);
    }
  }
}

/**
 * Factory function to create appropriate approval request
 */
export function createApprovalRequest(data: ApprovalRequestData, options: ApprovalRequestOptions): Container {
  switch (data.toolName) {
    case 'Bash':
      const { BashApprovalRequest } = require('./BashApprovalRequest.js');
      return new BashApprovalRequest(data, options);
    case 'Write':
    case 'Edit':
      const { WriteApprovalRequest } = require('./WriteApprovalRequest.js');
      return new WriteApprovalRequest(data, options);
    default:
      return new GenericApprovalRequest(data, options);
  }
}

/**
 * Simple factory function
 */
export function createSimpleApprovalRequest(
  tool: string,
  args: Record<string, unknown>,
  onSelect: (decision: ApprovalDecision) => void
): Container {
  return new GenericApprovalRequest({ toolName: tool, args }, { 
    onApprove: onSelect, 
    onDeny: () => onSelect('deny'),
    enableFeedback: false,
  });
}
