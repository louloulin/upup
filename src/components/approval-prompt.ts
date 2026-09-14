import { Container, Text } from '@earendil-works/pi-tui';
import type { ApprovalDecision } from '@upup/pi-event-adapter';
import { createApprovalSelector } from './select-list.js';
import { theme } from '../theme.js';
import { BorderBox } from './BorderBox.js';
import { t } from '../i18n/index.js';

function formatToolLabel(tool: string): string {
  return tool
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export class ApprovalPromptComponent extends Container {
  readonly selector: any;
  onSelect?: (decision: ApprovalDecision) => void;

  constructor(tool: string, args: Record<string, unknown>) {
    super();
    this.selector = createApprovalSelector((decision) => this.onSelect?.(decision));
    const path = (args.path as string) || '<unknown>';

    // Header using BorderBox
    const headerBox = new BorderBox(
      [new Text(theme.warning(theme.bold(t('approval.title'))))],
      { style: 'single', paddingX: 1 }
    );

    // Content using BorderBox
    const contentBox = new BorderBox(
      [
        new Text(formatToolLabel(tool), 0, 0),
        new Text(theme.primary(path), 0, 0),
        new Text('', 0, 0),
        new Text(theme.muted(t('approval.question')), 0, 0),
      ],
      { style: 'single', paddingX: 1 }
    );

    // Add components
    this.addChild(new Text(''));
    this.addChild(headerBox);
    this.addChild(new Text(''));
    this.addChild(contentBox);
    this.addChild(new Text(''));
    this.addChild(this.selector);
    this.addChild(new Text(''));
    this.addChild(new Text(theme.muted(t('approval.hint_enter_esc')), 0, 0));
  }
}
