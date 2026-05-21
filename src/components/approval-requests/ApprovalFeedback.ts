/**
 * Approval Feedback Module
 *
 * 授权反馈功能
 */

export interface ApprovalFeedback {
  decision: 'allow' | 'deny'
  reason?: string
  feedback?: string
  timestamp: number
}

/**
 * 预定义的反馈模板
 */
export const FEEDBACK_TEMPLATES = {
  allow: [
    'Safe operation',
    'Expected behavior',
    'Part of planned workflow',
  ],
  deny: [
    'Potentially dangerous',
    'Unexpected command',
    'Needs verification',
    'Path not verified',
    'Command too complex',
  ],
} as const

/**
 * 创建反馈
 */
export function createFeedback(
  decision: 'allow' | 'deny',
  feedback?: string
): ApprovalFeedback {
  return {
    decision,
    feedback,
    timestamp: Date.now(),
  }
}

/**
 * 格式化反馈为文本
 */
export function formatFeedback(feedback: ApprovalFeedback): string {
  let text = `Decision: ${feedback.decision}`
  if (feedback.feedback) {
    text += `\nFeedback: ${feedback.feedback}`
  }
  return text
}

/**
 * 记录反馈到历史
 */
const feedbackHistory: ApprovalFeedback[] = []

export function recordFeedback(feedback: ApprovalFeedback): void {
  feedbackHistory.push(feedback)

  // 限制历史大小
  if (feedbackHistory.length > 100) {
    feedbackHistory.shift()
  }
}

/**
 * 获取反馈历史
 */
export function getFeedbackHistory(): ApprovalFeedback[] {
  return [...feedbackHistory]
}

/**
 * 清除反馈历史
 */
export function clearFeedbackHistory(): void {
  feedbackHistory.length = 0
}