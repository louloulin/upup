/**
 * Approval Requests Components - pi-tui version
 *
 * 基于 pi-tui 的授权请求组件
 */

// Import Container for type
import type { Container } from '@earendil-works/pi-tui';
export type { Container };

// Import factory functions
import { createApprovalRequest } from './GenericApprovalRequest';

// Re-export all components
export {
  BaseApprovalRequest,
  SimpleApprovalRequest,
  formatToolLabel,
  formatDangerLevel,
  getDangerDescription,
  type ApprovalRequestData,
  type ApprovalRequestOptions,
} from './BaseApprovalRequest';

export { BashApprovalRequest, createBashApprovalRequest } from './BashApprovalRequest';
export { WriteApprovalRequest, createWriteApprovalRequest } from './WriteApprovalRequest';
export {
  GenericApprovalRequest,
  createApprovalRequest,
  createSimpleApprovalRequest
} from './GenericApprovalRequest';

// Re-export feedback functions from ApprovalFeedback module
export {
  createFeedback,
  formatFeedback,
  recordFeedback,
  getFeedbackHistory,
  clearFeedbackHistory,
  FEEDBACK_TEMPLATES,
} from './ApprovalFeedback';
export type { ApprovalFeedback } from './ApprovalFeedback';

// Re-export fullscreen overlay
export {
  FullscreenApprovalOverlay,
  createFullscreenApproval,
  type FullscreenOverlayCallbacks,
  type ApprovalOption,
} from './FullscreenApprovalOverlay';

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