// @ts-nocheck
/**
 * Feedback Command
 *
 * Submit feedback about the experience.
 */

import type { LocalCommand } from '../../types/command-types'

export const feedbackCommand: LocalCommand = {
  type: 'local',
  name: 'feedback',
  description: 'Submit feedback about the experience',
  aliases: ['suggest', 'idea'],
  argumentHint: '<feedback-text>',
  supportsNonInteractive: true,
  load: () => import('./feedback-impl'),
}