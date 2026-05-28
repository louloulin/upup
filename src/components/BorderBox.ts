/**
 * BorderBox Component
 *
 * A Box component wrapper that adds Unicode box-drawing borders.
 * This fills the gap in pi-tui's Box component which only supports padding and background.
 *
 * Supported border styles:
 * - 'single': Single line border (─┌┐└┘ etc.)
 * - 'double': Double line border (═╔╗╚╝ etc.)
 * - 'round': Rounded corners (╭╮╯╰)
 * - 'bold': Bold single line (━┏┓┗┛)
 */

import { Container, Text, Spacer, type Component } from '@earendil-works/pi-tui';

// Border drawing characters
const BORDERS = {
  single: {
    topLeft: '┌',
    topRight: '┐',
    bottomLeft: '└',
    bottomRight: '┘',
    horizontal: '─',
    vertical: '│',
  },
  double: {
    topLeft: '╔',
    topRight: '╗',
    bottomLeft: '╚',
    bottomRight: '╝',
    horizontal: '═',
    vertical: '║',
  },
  round: {
    topLeft: '╭',
    topRight: '╮',
    bottomLeft: '╰',
    bottomRight: '╯',
    horizontal: '─',
    vertical: '│',
  },
  bold: {
    topLeft: '┏',
    topRight: '┓',
    bottomLeft: '┗',
    bottomRight: '┛',
    horizontal: '━',
    vertical: '┃',
  },
};

export type BorderStyle = 'single' | 'double' | 'round' | 'bold';

export interface BorderBoxOptions {
  style?: BorderStyle;
  paddingX?: number;
  paddingY?: number;
}

export class BorderBox extends Container {
  private _children: Component[] = [];
  private options: Required<BorderBoxOptions>;
  private borderChars: typeof BORDERS.single;

  constructor(children: Component[] = [], options: BorderBoxOptions = {}) {
    super();
    this.options = {
      style: options.style ?? 'single',
      paddingX: options.paddingX ?? 1,
      paddingY: options.paddingY ?? 0,
    };
    this.borderChars = BORDERS[this.options.style];
    this._children = children;
  }

  addChild(component: Component): void {
    this._children.push(component);
    super.addChild(component);
  }

  removeChild(component: Component): void {
    const index = this._children.indexOf(component);
    if (index !== -1) {
      this._children.splice(index, 1);
      // Note: Container.removeChild is not standard, but we track our own children
    }
  }

  clear(): void {
    this._children = [];
    // Note: We'd need to clear the Container's children too
  }

  render(width: number): string[] {
    if (this._children.length === 0) {
      return [];
    }

    const lines: string[] = [];
    const { paddingX, paddingY } = this.options;
    const { topLeft, topRight, bottomLeft, bottomRight, horizontal, vertical } = this.borderChars;

    // Calculate content width (excluding borders and padding)
    const contentWidth = Math.max(1, width - paddingX * 2 - 2);
    const borderWidth = contentWidth + paddingX * 2;

    // Top border with padding
    const topBorder = topLeft + horizontal.repeat(borderWidth) + topRight;
    lines.push(topBorder);

    // Render children with padding
    for (let i = 0; i < paddingY; i++) {
      const paddedLine = vertical + ' '.repeat(borderWidth) + vertical;
      lines.push(paddedLine);
    }

    // Render each child
    for (const child of this._children) {
      const childLines = child.render(contentWidth);
      for (const childLine of childLines) {
        const paddedLine = vertical + ' '.repeat(paddingX) + childLine.padEnd(contentWidth) + ' '.repeat(paddingX) + vertical;
        lines.push(paddedLine);
      }
    }

    // Bottom padding
    for (let i = 0; i < paddingY; i++) {
      const paddedLine = vertical + ' '.repeat(borderWidth) + vertical;
      lines.push(paddedLine);
    }

    // Bottom border
    const bottomBorder = bottomLeft + horizontal.repeat(borderWidth) + bottomRight;
    lines.push(bottomBorder);

    return lines;
  }
}

// Convenience function to create a simple bordered text box
export function createBorderBox(title: string, lines: string[], style: BorderStyle = 'single'): BorderBox {
  const children: Component[] = [
    new Text(title, 0, 0),
    new Spacer(1),
  ];

  for (const line of lines) {
    children.push(new Text(line, 0, 0));
  }

  return new BorderBox(children, { style });
}
