import { Container, Text, SelectList } from '@earendil-works/pi-tui';
import type { ApprovalDecision } from '@upup/pi-runtime';
import { theme } from '@upup/utils';
import { createApprovalSelector } from './select-list.js';

/**
 * Inline Approval Selector Component
 *
 * Uses SelectList for keyboard navigation (like model selection)
 * and properly handles focus/inputs.
 */
export class InlineApprovalSelector extends Container {
  private selector: SelectList;
  private toolName: string;

  constructor(
    toolName: string,
    onSelect: (decision: ApprovalDecision) => void,
  ) {
    super();
    this.toolName = toolName;

    // Create the SelectList-based selector
    this.selector = createApprovalSelector(onSelect);

    // Add header
    this.addChild(new Text(theme.warning(`${theme.bold('⚠️  Permission Required')}`), 0, 0));
    this.addChild(new Text('', 0, 0));
    this.addChild(new Text(`${theme.primary('Tool:')} ${this.toolName}`, 0, 0));
    this.addChild(new Text('', 0, 0));

    // Add the selector
    this.addChild(this.selector);
  }

  handleInput(keyData: string): void {
    // Delegate to the selector
    if (this.selector && typeof this.selector.handleInput === 'function') {
      this.selector.handleInput(keyData);
    }
  }

  getSelector(): SelectList {
    return this.selector;
  }
}

/**
 * Create an inline approval selector with proper SelectList handling
 */
export function createInlineApprovalSelector(
  toolName: string,
  onSelect: (decision: ApprovalDecision) => void,
): InlineApprovalSelector {
  return new InlineApprovalSelector(toolName, onSelect);
}
