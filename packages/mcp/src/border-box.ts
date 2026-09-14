import { Container, Text, Spacer, type Component } from '@earendil-works/pi-tui';

export type BorderStyle = 'single' | 'double' | 'round' | 'bold';
const borders: Record<BorderStyle, [string, string, string, string, string, string]> = {
  single: ['┌', '┐', '└', '┘', '─', '│'],
  double: ['╔', '╗', '╚', '╝', '═', '║'],
  round: ['╭', '╮', '╰', '╯', '─', '│'],
  bold: ['┏', '┓', '┗', '┛', '━', '┃'],
};
export class BorderBox extends Container {
  private borderChildren: Component[];
  constructor(children: Component[] = [], private options: { style?: BorderStyle; paddingX?: number; paddingY?: number } = {}) {
    super(); this.borderChildren = children; for (const child of children) super.addChild(child);
  }
  addChild(component: Component): void { this.borderChildren.push(component); super.addChild(component); }
  removeChild(component: Component): void { this.borderChildren = this.borderChildren.filter((item) => item !== component); }
  render(width: number): string[] {
    if (!this.borderChildren.length) return [];
    const [tl, tr, bl, br, h, v] = borders[this.options.style ?? 'single'];
    const px = this.options.paddingX ?? 1;
    const py = this.options.paddingY ?? 0;
    const contentWidth = Math.max(1, width - px * 2 - 2);
    const borderWidth = contentWidth + px * 2;
    const lines = [tl + h.repeat(borderWidth) + tr];
    for (let i = 0; i < py; i++) lines.push(v + ' '.repeat(borderWidth) + v);
    for (const child of this.borderChildren) for (const line of child.render(contentWidth)) lines.push(v + ' '.repeat(px) + line.padEnd(contentWidth) + ' '.repeat(px) + v);
    for (let i = 0; i < py; i++) lines.push(v + ' '.repeat(borderWidth) + v);
    lines.push(bl + h.repeat(borderWidth) + br);
    return lines;
  }
}
export function createBorderBox(title: string, lines: string[], style: BorderStyle = 'single'): BorderBox {
  return new BorderBox([new Text(title, 0, 0), new Spacer(1), ...lines.map((line) => new Text(line, 0, 0))], { style });
}
