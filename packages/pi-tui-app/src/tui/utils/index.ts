/**
 * TUI Utils Module
 *
 * 导出所有工具函数
 */

// Format utilities
export {
  formatRelativeTime,
  formatTime,
  formatDateTime,
  formatDuration,
  formatTokens,
  formatCost,
  formatPercent,
  truncate,
  wrapText,
  stripAnsi,
  visualWidth,
  padEnd,
  centerText,
  formatFileSize,
  renderProgressBar,
  renderIndeterminateProgressBar,
  type TableColumn,
  renderTableRow,
  renderTableDivider,
} from './format';

// Theme utilities
export {
  ANSI,
  type Theme,
  DARK_THEME,
  LIGHT_THEME,
  NORD_THEME,
  DRACULA_THEME,
  getTheme,
  getAvailableThemes,
  style,
  gradient,
  bg,
  STYLES,
} from './theme';

// Key bindings utilities
export {
  type KeyBinding,
  type KeyBindingContext,
  KEY_NAMES,
  type KeyMap,
  type KeyModifier,
  parseKeyCombo,
  formatKeyCombo,
  KeyHandlerRegistry,
  NAVIGATION_KEYS,
  EDIT_KEYS,
  GLOBAL_KEYS,
  type TUIMode,
  type TUIModeBindings,
  getModeBindings,
  KeySequenceDetector,
} from './keybindings';
