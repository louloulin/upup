/**
 * Approval UI Interaction Tests
 *
 * Tests for TUI interactive functionality
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import { getApprovalConfig, setApprovalConfig, getTimeoutForTool } from '../../permissions/index.js'
import { ApprovalFeedback, createFeedback, formatFeedback, recordFeedback, clearFeedbackHistory, getFeedbackHistory } from './ApprovalFeedback.js'
import { getApprovalManager } from '../permissions/ApprovalManager.js'

describe('ApprovalConfig', () => {
  beforeEach(() => {
    // Reset to defaults
    setApprovalConfig({})
  })

  it('should return default timeout of 60 seconds', () => {
    const config = getApprovalConfig()
    expect(config.timeout.defaultMs).toBe(60000)
  })

  it('should get timeout for Bash tool (2 minutes)', () => {
    const timeout = getTimeoutForTool('Bash')
    expect(timeout).toBe(120000)
  })

  it('should get timeout for Write tool (30 seconds)', () => {
    const timeout = getTimeoutForTool('Write')
    expect(timeout).toBe(30000)
  })

  it('should get timeout for Read tool (15 seconds)', () => {
    const timeout = getTimeoutForTool('Read')
    expect(timeout).toBe(15000)
  })

  it('should get default timeout for unknown tools', () => {
    const timeout = getTimeoutForTool('UnknownTool')
    expect(timeout).toBe(60000)
  })

  it('should update timeout via setApprovalConfig', () => {
    setApprovalConfig({ timeout: { enabled: true, defaultMs: 30000 } })
    const config = getApprovalConfig()
    expect(config.timeout.defaultMs).toBe(30000)
  })

  it('should have default options', () => {
    const config = getApprovalConfig()
    expect(config.options).toHaveLength(3)
    expect(config.options[0].value).toBe('allow-once')
    expect(config.options[1].value).toBe('allow-session')
    expect(config.options[2].value).toBe('deny')
  })
})

describe('ApprovalFeedback', () => {
  beforeEach(() => {
    clearFeedbackHistory()
  })

  it('should create feedback with decision', () => {
    const feedback = createFeedback('allow', 'Safe operation')
    expect(feedback.decision).toBe('allow')
    expect(feedback.feedback).toBe('Safe operation')
    expect(feedback.timestamp).toBeDefined()
  })

  it('should format feedback as text', () => {
    const feedback = createFeedback('deny', 'Dangerous')
    const text = formatFeedback(feedback)
    expect(text).toContain('Decision: deny')
    expect(text).toContain('Feedback: Dangerous')
  })

  it('should record feedback to history', () => {
    const feedback = createFeedback('allow', 'Test')
    recordFeedback(feedback)
    const history = getFeedbackHistory()
    expect(history.length).toBeGreaterThan(0)
  })
})

describe('ApprovalManager', () => {
  let manager: ReturnType<typeof getApprovalManager>

  beforeEach(() => {
    manager = getApprovalManager()
    // Reset manager state
    const state = manager.getState()
    if (state.isPending) {
      manager.respond('deny')
    }
  })

  it('should have no pending state initially', () => {
    const state = manager.getState()
    expect(state.isPending).toBe(false)
  })

  it('should get initial state', () => {
    const state = manager.getState()
    expect(state).toHaveProperty('isPending')
    expect(state).toHaveProperty('currentRequest')
    expect(state).toHaveProperty('history')
  })

  it('should start with empty history', () => {
    const history = manager.getHistory()
    expect(history).toHaveLength(0)
  })

  it('should check consistency of initial state', () => {
    const check = manager.checkConsistency()
    expect(check.consistent).toBe(true)
    expect(check.issues).toHaveLength(0)
  })

  it('should clear history', () => {
    manager.clearHistory()
    const history = manager.getHistory()
    expect(history).toHaveLength(0)
  })

  it('should add listener', () => {
    let called = false
    const unsubscribe = manager.addListener(() => {
      called = true
    })
    expect(typeof unsubscribe).toBe('function')
    unsubscribe()
  })
})

describe('Danger Level Detection', () => {
  it('should detect high danger for Bash', async () => {
    const { getToolDangerLevel } = await import('../../utils/permissions/index.js')
    expect(getToolDangerLevel('Bash')).toBe('high')
  })

  it('should detect medium danger for Write', async () => {
    const { getToolDangerLevel } = await import('../../utils/permissions/index.js')
    expect(getToolDangerLevel('Write')).toBe('medium')
  })

  it('should detect low danger for Read', async () => {
    const { getToolDangerLevel } = await import('../../utils/permissions/index.js')
    expect(getToolDangerLevel('Read')).toBe('low')
  })
})

describe('TUI Keyboard Interaction', () => {
  it('should define keyboard shortcuts', () => {
    const config = getApprovalConfig()
    expect(config.ui.shortcuts).toBeDefined()
    expect(config.ui.shortcuts.allowOnce).toBe('1')
    expect(config.ui.shortcuts.allowSession).toBe('2')
    expect(config.ui.shortcuts.deny).toBe('3')
  })

  it('should support danger warning toggle', () => {
    const config = getApprovalConfig()
    expect(config.ui.showDangerWarning).toBe(true)
  })

  it('should support feedback toggle', () => {
    const config = getApprovalConfig()
    expect(config.ui.enableFeedback).toBe(false) // Default is off
  })
})

describe('Hard-Deny Detection', () => {
  it('should detect fork bomb', async () => {
    const { isHardDenyCommand } = await import('../../utils/permissions/index.js')
    expect(isHardDenyCommand(':(){:|:&};:')).toBe(true)
  })

  it('should detect rm -rf /', async () => {
    const { isHardDenyCommand } = await import('../../utils/permissions/index.js')
    expect(isHardDenyCommand('rm -rf /')).toBe(true)
    expect(isHardDenyCommand('rm -rf //')).toBe(true)
  })

  it('should detect mkfs', async () => {
    const { isHardDenyCommand } = await import('../../utils/permissions/index.js')
    expect(isHardDenyCommand('mkfs ext4 /dev/sda')).toBe(true)
  })

  it('should allow safe commands', async () => {
    const { isHardDenyCommand } = await import('../../utils/permissions/index.js')
    expect(isHardDenyCommand('ls -la')).toBe(false)
    expect(isHardDenyCommand('git status')).toBe(false)
    expect(isHardDenyCommand('echo hello')).toBe(false)
  })
})