// @ts-nocheck
/**
 * Heartbeat Command
 *
 * Show heartbeat checklist from .upup/HEARTBEAT.md
 */

import type { LocalCommand } from '../../types/command-types'

export const heartbeatCommand: LocalCommand = {
  type: 'local',
  name: 'heartbeat',
  description: 'Show heartbeat checklist from .upup/HEARTBEAT.md',
  aliases: ['checklist'],
  supportsNonInteractive: true,
  load: () => import('./heartbeat-impl'),
}