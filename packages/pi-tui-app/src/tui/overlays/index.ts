/**
 * TUI Overlays Module
 *
 * 导出所有浮层组件
 */

// Approval Overlay
export {
  ApprovalOverlay,
  createApprovalOverlay,
  type ApprovalRequest,
  type ApprovalOverlayProps,
} from './approval-overlay.js';

// Model Selector
export {
  ModelSelector,
  createModelSelector,
  DEFAULT_MODELS,
  type Model,
  type ModelSelectorProps,
} from './model-selector.js';

// Session Selector
export {
  SessionSelector,
  createSessionSelector,
  type Session,
  type SessionSelectorProps,
} from './session-selector.js';

// Confirm Dialog
export {
  ConfirmDialog,
  createConfirmDialog,
  createExitConfirmDialog,
  createClearHistoryDialog,
  type ConfirmDialogType,
  type ConfirmDialogProps,
} from './confirm-dialog.js';
