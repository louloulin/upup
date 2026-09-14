/**
 * Write Approval Request Component (pi-tui native + BorderBox)
 *
 * 基于 pi-tui 的文件写入专用授权请求组件
 * 使用 BorderBox 组件替代手动边框绘制
 */

import { Container, Text, Spacer, type Component } from '@earendil-works/pi-tui';
import { BorderBox } from '../BorderBox.js';
import type { ApprovalDecision } from '@upup/pi-runtime';
import { theme } from '@upup/utils';
import type { ApprovalRequestData, ApprovalRequestOptions } from './BaseApprovalRequest.js';

export class WriteApprovalRequest extends Container {
  private filePath: string;
  private selector: any;
  private headerBox: BorderBox;
  private contentBox: BorderBox;
  private hintText: Text;

  constructor(data: ApprovalRequestData, options: ApprovalRequestOptions) {
    super();
    this.filePath = (data.args.file_path || data.args.path || data.args.file) as string || 'unknown';

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

  private getFileName(): string {
    const parts = this.filePath.split('/');
    return parts[parts.length - 1] || this.filePath;
  }

  private getDirectory(): string {
    const lastSlash = this.filePath.lastIndexOf('/');
    return lastSlash > 0 ? this.filePath.substring(0, lastSlash) : '.';
  }

  private isSensitivePath(): boolean {
    const lower = this.filePath.toLowerCase();
    const sensitivePatterns = [
      '/etc/', '/bin/', '/sbin/', '/usr/bin/', '/usr/sbin/',
      '.ssh/', '.aws/', 'credentials', 'secrets', 'password', 'key',
    ];
    return sensitivePatterns.some(p => lower.includes(p));
  }

  private createHeaderBox(): BorderBox {
    const children: Component[] = [
      new Text(theme.warning(theme.bold('⚠️  Permission Required - Write File')), 0, 0),
    ];
    return new BorderBox(children, { style: 'single', paddingX: 1, paddingY: 0 });
  }

  private createContentBox(): BorderBox {
    const children: Component[] = [];
    const sensitive = this.isSensitivePath();

    // File info
    children.push(new Text(`File: ${theme.primary(this.filePath)}`, 0, 0));
    children.push(new Text(`Directory: ${this.getDirectory()}`, 0, 0));

    // Sensitive warning
    if (sensitive) {
      children.push(new Text('', 0, 0));
      children.push(new Text(theme.warning('⚠️  WARNING: This path may contain sensitive data!'), 0, 0));
    }

    return new BorderBox(children, { style: 'single', paddingX: 1, paddingY: 0 });
  }

  handleInput(keyData: string): void {
    if (this.selector && typeof this.selector.handleInput === 'function') {
      this.selector.handleInput(keyData);
    }
  }
}

export function createWriteApprovalRequest(data: ApprovalRequestData, options: ApprovalRequestOptions): WriteApprovalRequest {
  return new WriteApprovalRequest(data, options);
}
