/**
 * Doctor Command
 * 
 * Runs system health checks: API keys, memory, MCP, permissions.
 * 
 * Type: local (direct execution, no model involvement)
 * 
 * Reference: loucode/src/commands/doctor/index.ts
 */

import type { LocalCommand } from '../../types/command-types.js'

export const doctorCommand: LocalCommand = {
  type: 'local',
  name: 'doctor',
  description: 'Run system health checks',
  aliases: ['health', 'check'],
  supportsNonInteractive: true,
  load: () => import('./doctor-impl.js'),
}

export default doctorCommand