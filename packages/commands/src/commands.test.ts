/**
 * Command System Tests
 *
 * Tests for the unified command system using ALL_COMMANDS.
 * Covers command registration, execution, aliases, matching, and usage tracking.
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import {
  CommandRegistry,
  registerBuiltinCommands,
  resetGlobalRegistry,
  type Command,
  type CommandContext,
} from './commands.js'

import {
  ALL_COMMANDS,
  findCommand,
  executeCommand,
  COMMAND_ALIASES,
  ALIAS_TO_COMMAND,
} from './all-commands.js'

const defaultContext: CommandContext = {
  cwd: '/test',
  env: {},
  sessionId: 'test-session',
  model: 'gpt-5.4',
}

// ============================================================================
// Old Registry Tests (backward compatibility)
// ============================================================================

describe('CommandRegistry', () => {
  let registry: CommandRegistry

  beforeEach(() => {
    registry = new CommandRegistry()
    resetGlobalRegistry()
  })

  describe('register', () => {
    it('should register a command', () => {
      const cmd: Command = {
        name: 'test',
        description: 'Test command',
        execute: async (args) => ({ type: 'output', text: `test: ${args}` }),
      }
      registry.register(cmd)
      expect(registry.has('test')).toBe(true)
    })

    it('should register command with aliases', () => {
      const cmd: Command = {
        name: 'test',
        description: 'Test',
        aliases: ['t', 'testcmd'],
        execute: async () => ({ type: 'output', text: 'ok' }),
      }
      registry.register(cmd)
      expect(registry.has('t')).toBe(true)
      expect(registry.has('testcmd')).toBe(true)
    })
  })

  describe('unregister', () => {
    it('should unregister a command', () => {
      const cmd: Command = {
        name: 'test',
        description: 'Test',
        execute: async () => ({ type: 'output', text: 'ok' }),
      }
      registry.register(cmd)
      expect(registry.unregister('test')).toBe(true)
      expect(registry.has('test')).toBe(false)
    })

    it('should return false for unknown command', () => {
      expect(registry.unregister('unknown')).toBe(false)
    })
  })

  describe('get', () => {
    it('should get command by name', () => {
      const cmd: Command = {
        name: 'test',
        description: 'Test',
        execute: async () => ({ type: 'output', text: 'ok' }),
      }
      registry.register(cmd)
      expect(registry.get('test')).toBeDefined()
    })

    it('should get command by alias', () => {
      const cmd: Command = {
        name: 'test',
        description: 'Test',
        aliases: ['t'],
        execute: async () => ({ type: 'output', text: 'ok' }),
      }
      registry.register(cmd)
      expect(registry.get('t')!.name).toBe('test')
    })
  })

  describe('execute', () => {
    it('should execute a registered command', async () => {
      const cmd: Command = {
        name: 'greet',
        description: 'Greet',
        execute: async (args) => ({ type: 'output', text: `Hello ${args}` }),
      }
      registry.register(cmd)
      const result = await registry.execute('/greet World', defaultContext)
      expect(result.type).toBe('output')
      if (result.type === 'output') expect(result.text).toBe('Hello World')
    })

    it('should return error for unknown command', async () => {
      const result = await registry.execute('/unknown', defaultContext)
      expect(result.type).toBe('error')
      if (result.type === 'error') expect(result.message).toContain('Unknown command')
    })
  })
})

// ============================================================================
// Built-in Commands Tests (registry API)
// ============================================================================

describe('Built-in Commands', () => {
  let registry: CommandRegistry

  beforeEach(() => {
    registry = new CommandRegistry()
    registerBuiltinCommands(registry)
  })

  describe('/help', () => {
    it('should list commands', async () => {
      const result = await registry.execute('/help', defaultContext)
      expect(result.type).toBe('output')
      if (result.type === 'output') {
        expect(result.text).toContain('/help')
        expect(result.text).toContain('/clear')
      }
    })

    it('should show command details', async () => {
      const result = await registry.execute('/help help', defaultContext)
      expect(result.type).toBe('output')
      if (result.type === 'output') {
        expect(result.text).toContain('/help')
        expect(result.text).toContain('Show available commands')
      }
    })
  })

  describe('/clear', () => {
    it('should return clear result', async () => {
      const result = await registry.execute('/clear', defaultContext)
      expect(result).toEqual({ type: 'clear' })
    })
  })

  describe('/tools', () => {
    it('lists tools supplied by the active Pi Session', async () => {
      const result = await registry.execute('/tools', {
        ...defaultContext,
        tools: [{ name: 'get_market_data', description: 'Read market data' }],
      });
      expect(result).toEqual({ type: 'output', text: 'Registered Tools (1):\n\n  get_market_data          Read market data' });
    });

    it('does not fall back to a root tool registry', async () => {
      const result = await registry.execute('/tools', defaultContext);
      expect(result).toEqual({ type: 'output', text: 'No tools are available in the active Pi Session.' });
    });
  });

  describe('/compact', () => {
    it('should return compact result', async () => {
      const result = await registry.execute('/compact', defaultContext)
      expect(result).toEqual({ type: 'compact' })
    })
  })

  describe('/status', () => {
    it('should return status info', async () => {
      const result = await registry.execute('/status', defaultContext)
      expect(result.type).toBe('output')
      if (result.type === 'output') {
        expect(result.text).toContain('/test')
        expect(result.text).toContain('gpt-5.4')
      }
    })
  })

  describe('/model', () => {
    it('should show current model', async () => {
      const result = await registry.execute('/model', defaultContext)
      expect(result.type).toBe('output')
      if (result.type === 'output') expect(result.text).toContain('gpt-5.4')
    })
  })

  describe('/config', () => {
    it('should show config', async () => {
      const result = await registry.execute('/config', defaultContext)
      expect(result.type).toBe('output')
      if (result.type === 'output') {
        expect(result.text).toContain('Current Configuration')
      }
    })
  })

  describe('/export', () => {
    it('should return error without filename', async () => {
      const result = await registry.execute('/export', defaultContext)
      expect(result.type).toBe('error')
      if (result.type === 'error') expect(result.message).toContain('Usage')
    })

    it('should export with filename', async () => {
      const result = await registry.execute('/export result.md', defaultContext)
      expect(result.type).toBe('output')
      if (result.type === 'output') expect(result.text).toContain('exported')
    })
  })

  // Git commands (may fail in test env with invalid cwd)
  describe('/git', () => {
    it('should run git status or return error in test env', async () => {
      const result = await registry.execute('/git', defaultContext)
      expect(['output', 'error']).toContain(result.type)
    })
  })

  describe('/diff', () => {
    it('should run git diff or return error in test env', async () => {
      const result = await registry.execute('/diff', defaultContext)
      expect(['output', 'error']).toContain(result.type)
    })
  })
})

// ============================================================================
// ALL_COMMANDS Tests (new unified API)
// ============================================================================

describe('ALL_COMMANDS', () => {
  it('should have 49 commands', () => {
    expect(ALL_COMMANDS.length).toBe(49)
  })

  it('should have unique names', () => {
    const names = ALL_COMMANDS.map((c: any) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('should have descriptions for all commands', () => {
    for (const cmd of ALL_COMMANDS) {
      expect(cmd.description).toBeTruthy()
    }
  })

  it('should have valid types', () => {
    for (const cmd of ALL_COMMANDS) {
      expect(['local', 'local-jsx', 'prompt']).toContain((cmd as any).type)
    }
  })
})

describe('findCommand', () => {
  it('should find by name', () => {
    expect(findCommand('help')?.name).toBe('help')
    expect(findCommand('status')?.name).toBe('status')
  })

  it('should find by alias', () => {
    expect(findCommand('h')?.name).toBe('help')
    expect(findCommand('s')?.name).toBe('session')
    expect(findCommand('c')?.name).toBe('resume')
  })

  it('should return undefined for unknown', () => {
    expect(findCommand('nonexistent')).toBeUndefined()
  })
})

describe('executeCommand (new API)', () => {
  it('should execute /help', async () => {
    const result = await executeCommand('help', '', defaultContext as any)
    expect(result.type).toBe('jsx')
  })

  it('should execute /status', async () => {
    const result = await executeCommand('status', '', defaultContext as any)
    expect(result.type).toBe('output')
  })

  it('should execute alias /h', async () => {
    const result = await executeCommand('h', '', defaultContext as any)
    expect(result.type).toBe('jsx')
  })

  it('should execute alias /c', async () => {
    const result = await executeCommand('c', '', defaultContext as any)
    expect(result.type).toBe('output')
  })

  it('should return error for unknown', async () => {
    const result = await executeCommand('unknown', '', defaultContext as any)
    expect(result.type).toBe('error')
  })
})

describe('Aliases', () => {
  it('should have help aliases', () => {
    expect(COMMAND_ALIASES['help']).toContain('h')
    expect(COMMAND_ALIASES['help']).toContain('?')
  })

  it('should have resume aliases', () => {
    expect(COMMAND_ALIASES['resume']).toContain('r')
    expect(COMMAND_ALIASES['resume']).toContain('c')
  })

  it('should be consistent', () => {
    for (const [alias, cmd] of Object.entries(ALIAS_TO_COMMAND)) {
      expect(COMMAND_ALIASES[cmd]).toContain(alias)
    }
  })
})

describe('Command Type Distribution', () => {
  it('should have local commands', () => {
    const locals = ALL_COMMANDS.filter((c: any) => c.type === 'local')
    expect(locals.length).toBeGreaterThan(30)
  })

  it('should have local-jsx commands', () => {
    const jsx = ALL_COMMANDS.filter((c: any) => c.type === 'local-jsx')
    expect(jsx.length).toBeGreaterThan(0)
    expect(jsx.some((c: any) => c.name === 'help')).toBe(true)
  })

  it('should have prompt commands', () => {
    const prompts = ALL_COMMANDS.filter((c: any) => c.type === 'prompt')
    expect(prompts.length).toBeGreaterThan(0)
  })
})
