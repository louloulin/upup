/**
 * Theme Utilities
 *
 * 对标 Loucode theme utilities
 * 主题颜色和样式定义
 */

// ============================================================================
// ANSI Color Codes
// ============================================================================

export const ANSI = {
  // 基础颜色
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  default: '\x1b[39m',

  // 亮色
  brightBlack: '\x1b[90m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',

  // 样式
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  inverse: '\x1b[7m',
  hidden: '\x1b[8m',
  strikethrough: '\x1b[9m',

  // 重置
  reset: '\x1b[0m',
  resetBold: '\x1b[21m',
  resetDim: '\x1b[22m',
  resetUnderline: '\x1b[24m',
};

// ============================================================================
// Theme Definitions
// ============================================================================

export interface Theme {
  name: string;
  colors: {
    // 边框
    border: string;
    borderFocused: string;

    // 背景
    bg: string;
    bgAlt: string;
    bgSelected: string;
    bgHighlight: string;

    // 前景 (文字)
    fg: string;
    fgMuted: string;
    fgBright: string;

    // 特殊
    error: string;
    warning: string;
    success: string;
    info: string;

    // 角色颜色
    user: string;
    assistant: string;
    system: string;
    tool: string;

    // 链接
    link: string;
    linkHover: string;
  };
}

// ============================================================================
// Default Theme (Dark)
// ============================================================================

export const DARK_THEME: Theme = {
  name: 'dark',
  colors: {
    border: ANSI.brightBlack,
    borderFocused: ANSI.brightCyan,

    bg: '',
    bgAlt: ANSI.brightBlack,
    bgSelected: ANSI.brightBlue + ANSI.black,
    bgHighlight: ANSI.blue + ANSI.white,

    fg: ANSI.white,
    fgMuted: ANSI.brightBlack,
    fgBright: ANSI.brightWhite,

    error: ANSI.red,
    warning: ANSI.yellow,
    success: ANSI.green,
    info: ANSI.cyan,

    user: ANSI.brightBlue,
    assistant: ANSI.brightGreen,
    system: ANSI.brightYellow,
    tool: ANSI.brightMagenta,

    link: ANSI.cyan,
    linkHover: ANSI.brightCyan + ANSI.underline,
  },
};

// ============================================================================
// Light Theme
// ============================================================================

export const LIGHT_THEME: Theme = {
  name: 'light',
  colors: {
    border: ANSI.black,
    borderFocused: ANSI.blue,

    bg: '',
    bgAlt: ANSI.black + ANSI.white,
    bgSelected: ANSI.blue + ANSI.white,
    bgHighlight: ANSI.blue + ANSI.white,

    fg: ANSI.black,
    fgMuted: ANSI.brightBlack,
    fgBright: ANSI.black,

    error: ANSI.red,
    warning: ANSI.brightBlack + ANSI.red,
    success: ANSI.brightBlack + ANSI.green,
    info: ANSI.blue,

    user: ANSI.blue,
    assistant: ANSI.green,
    system: ANSI.brightBlack,
    tool: ANSI.magenta,

    link: ANSI.blue,
    linkHover: ANSI.blue + ANSI.underline,
  },
};

// ============================================================================
// Nord Theme (Popular)
// ============================================================================

export const NORD_THEME: Theme = {
  name: 'nord',
  colors: {
    border: ANSI.brightBlack,
    borderFocused: ANSI.cyan,

    bg: '',
    bgAlt: ANSI.brightBlack,
    bgSelected: ANSI.blue,
    bgHighlight: ANSI.cyan,

    fg: ANSI.white,
    fgMuted: ANSI.brightBlack,
    fgBright: ANSI.brightWhite,

    error: ANSI.red,
    warning: ANSI.yellow,
    success: ANSI.green,
    info: ANSI.cyan,

    user: ANSI.cyan,
    assistant: ANSI.green,
    system: ANSI.yellow,
    tool: ANSI.magenta,

    link: ANSI.cyan,
    linkHover: ANSI.brightCyan + ANSI.underline,
  },
};

// ============================================================================
// Dracula Theme
// ============================================================================

export const DRACULA_THEME: Theme = {
  name: 'dracula',
  colors: {
    border: ANSI.brightBlack,
    borderFocused: ANSI.magenta,

    bg: '',
    bgAlt: ANSI.brightBlack,
    bgSelected: ANSI.magenta,
    bgHighlight: ANSI.cyan,

    fg: ANSI.white,
    fgMuted: ANSI.brightBlack,
    fgBright: ANSI.brightWhite,

    error: ANSI.red,
    warning: ANSI.yellow,
    success: ANSI.green,
    info: ANSI.cyan,

    user: ANSI.cyan,
    assistant: ANSI.green,
    system: ANSI.yellow,
    tool: ANSI.magenta,

    link: ANSI.cyan,
    linkHover: ANSI.brightCyan + ANSI.underline,
  },
};

// ============================================================================
// Theme Registry
// ============================================================================

const THEMES: Record<string, Theme> = {
  dark: DARK_THEME,
  light: LIGHT_THEME,
  nord: NORD_THEME,
  dracula: DRACULA_THEME,
};

/**
 * 获取主题
 */
export function getTheme(name: string): Theme {
  return THEMES[name] || DARK_THEME;
}

/**
 * 获取所有可用主题
 */
export function getAvailableThemes(): string[] {
  return Object.keys(THEMES);
}

// ============================================================================
// Style Helpers
// ============================================================================

/**
 * 组合样式
 */
export function style(...styles: string[]): string {
  return styles.join('') + ANSI.reset;
}

/**
 * 渐变色文本 (终端支持256色)
 */
export function gradient(text: string, from: string, to: string): string {
  // 简化实现 - 实际应该根据字符位置插值
  return from + text + ANSI.reset;
}

/**
 * 带背景的文字
 */
export function bg(color: string, text: string): string {
  return color + text + ANSI.reset;
}

// ============================================================================
// Predefined Styles
// ============================================================================

export const STYLES = {
  // 标题
  title: ANSI.bold + ANSI.white,
  subtitle: ANSI.bold + ANSI.brightWhite,

  // 边框
  border: ANSI.brightBlack,
  borderFocused: ANSI.brightCyan,

  // 按钮
  button: ANSI.brightWhite,
  buttonFocused: ANSI.bold + ANSI.white + ANSI.inverse,
  buttonDisabled: ANSI.dim + ANSI.brightBlack,

  // 提示
  hint: ANSI.brightBlack,
  hintFocused: ANSI.white,

  // 状态
  success: ANSI.brightGreen,
  warning: ANSI.brightYellow,
  error: ANSI.brightRed,
  info: ANSI.brightCyan,

  // 重置
  reset: ANSI.reset,
};
