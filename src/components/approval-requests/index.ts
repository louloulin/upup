/**
 * Approval Requests Components - pi-tui version
 *
 * 基于 pi-tui 的授权请求组件
 */

// Import Container for type
import type { Container } from '@mariozechner/pi-tui';
export type { Container };

// Import factory functions
import { createApprovalRequest } from './GenericApprovalRequest.js';

// Re-export all components
export {
  BaseApprovalRequest,
  SimpleApprovalRequest,
  formatToolLabel,
  formatDangerLevel,
  getDangerDescription,
  type ApprovalRequestData,
  type ApprovalRequestOptions,
} from './BaseApprovalRequest.js';

export { BashApprovalRequest, createBashApprovalRequest } from './BashApprovalRequest.js';
export { WriteApprovalRequest, createWriteApprovalRequest } from './WriteApprovalRequest.js';
export {
  GenericApprovalRequest,
  createApprovalRequest,
  createSimpleApprovalRequest
} from './GenericApprovalRequest.js';

// Re-export feedback functions from ApprovalFeedback module
export {
  createFeedback,
  formatFeedback,
  recordFeedback,
  getFeedbackHistory,
  clearFeedbackHistory,
  FEEDBACK_TEMPLATES,
} from './ApprovalFeedback.js';
export type { ApprovalFeedback } from './ApprovalFeedback.js';

// Re-export fullscreen overlay
export {
  FullscreenApprovalOverlay,
  createFullscreenApproval,
  type FullscreenOverlayCallbacks,
  type ApprovalOption,
} from './FullscreenApprovalOverlay.js';

// Factory function for creating approval request by tool name
export function createToolApprovalRequest(
  tool: string,
  args: Record<string, unknown>,
  onSelect: (decision: 'allow-once' | 'allow-session' | 'deny') => void
): Container {
  return createApprovalRequest({ toolName: tool, args }, {
    onApprove: onSelect,
    onDeny: () => onSelect('deny'),
    enableFeedback: false,
  });
}