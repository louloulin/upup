/**
 * Tests for Commands System
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  CommandRegistry,
  registerBuiltinCommands,
  resetGlobalRegistry,
  type Command,
  type CommandContext,
} from './commands.js';

const defaultContext: CommandContext = {
  cwd: '/test',
  env: {},
  sessionId: 'test-session',
  model: 'gpt-5.4',
};

describe('CommandRegistry', () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = new CommandRegistry();
    resetGlobalRegistry();
  });

  describe('register', () => {
    it('should register a command', () => {
      const cmd: Command = {
        name: 'test',
        description: 'Test command',
        async execute(args) {
          return { type: 'output', text: `test: ${args}` };
        },
      };
      registry.register(cmd);
      expect(registry.has('test')).toBe(true);
    });

    it('should register command with aliases', () => {
      const cmd: Command = {
        name: 'test',
        description: 'Test',
        aliases: ['t', 'testcmd'],
        async execute() { return { type: 'output', text: 'ok' }; },
      };
      registry.register(cmd);
      expect(registry.has('t')).toBe(true);
      expect(registry.has('testcmd')).toBe(true);
    });
  });

  describe('unregister', () => {
    it('should unregister a command', () => {
      const cmd: Command = {
        name: 'test',
        description: 'Test',
        async execute() { return { type: 'output', text: 'ok' }; },
      };
      registry.register(cmd);
      expect(registry.unregister('test')).toBe(true);
      expect(registry.has('test')).toBe(false);
    });

    it('should return false for unknown command', () => {
      expect(registry.unregister('unknown')).toBe(false);
    });

    it('should remove aliases on unregister', () => {
      const cmd: Command = {
        name: 'test',
        description: 'Test',
        aliases: ['t'],
        async execute() { return { type: 'output', text: 'ok' }; },
      };
      registry.register(cmd);
      registry.unregister('test');
      expect(registry.has('t')).toBe(false);
    });
  });

  describe('get', () => {
    it('should get command by name', () => {
      const cmd: Command = {
        name: 'test',
        description: 'Test',
        async execute() { return { type: 'output', text: 'ok' }; },
      };
      registry.register(cmd);
      expect(registry.get('test')).toBeDefined();
    });

    it('should get command by alias', () => {
      const cmd: Command = {
        name: 'test',
        description: 'Test',
        aliases: ['t'],
        async execute() { return { type: 'output', text: 'ok' }; },
      };
      registry.register(cmd);
      expect(registry.get('t')).toBeDefined();
      expect(registry.get('t')!.name).toBe('test');
    });

    it('should return undefined for unknown', () => {
      expect(registry.get('unknown')).toBeUndefined();
    });
  });

  describe('list', () => {
    it('should list commands', () => {
      registry.register({ name: 'a', description: 'A', async execute() { return { type: 'noop' }; } });
      registry.register({ name: 'b', description: 'B', async execute() { return { type: 'noop' }; } });
      expect(registry.list().length).toBe(2);
    });

    it('should hide hidden commands by default', () => {
      registry.register({ name: 'visible', description: 'Visible', async execute() { return { type: 'noop' }; } });
      registry.register({ name: 'hidden', description: 'Hidden', hidden: true, async execute() { return { type: 'noop' }; } });
      expect(registry.list().length).toBe(1);
      expect(registry.list(true).length).toBe(2);
    });
  });

  describe('parse', () => {
    it('should parse slash command with no args', () => {
      const result = registry.parse('/help');
      expect(result).toEqual({ name: 'help', args: '' });
    });

    it('should parse slash command with args', () => {
      const result = registry.parse('/echo hello world');
      expect(result).toEqual({ name: 'echo', args: 'hello world' });
    });

    it('should return null for non-command', () => {
      expect(registry.parse('hello world')).toBeNull();
      expect(registry.parse('')).toBeNull();
    });

    it('should handle case insensitive', () => {
      const result = registry.parse('/HELP');
      expect(result).toEqual({ name: 'help', args: '' });
    });

    it('should handle extra whitespace', () => {
      const result = registry.parse('/help   arg1   arg2  ');
      expect(result).toEqual({ name: 'help', args: 'arg1   arg2' });
    });
  });

  describe('execute', () => {
    it('should execute a command', async () => {
      const cmd: Command = {
        name: 'greet',
        description: 'Greet',
        async execute(args) { return { type: 'output', text: `Hello ${args}` }; },
      };
      registry.register(cmd);
      const result = await registry.execute('/greet World', defaultContext);
      expect(result).toEqual({ type: 'output', text: 'Hello World' });
    });

    it('should return error for unknown command', async () => {
      const result = await registry.execute('/unknown', defaultContext);
      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.message).toContain('Unknown command');
      }
    });

    it('should return error for non-command input', async () => {
      const result = await registry.execute('not a command', defaultContext);
      expect(result.type).toBe('error');
    });

    it('should handle command errors', async () => {
      const cmd: Command = {
        name: 'fail',
        description: 'Fails',
        async execute() { throw new Error('Command failed'); },
      };
      registry.register(cmd);
      const result = await registry.execute('/fail', defaultContext);
      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.message).toContain('failed');
      }
    });
  });
});

describe('Built-in Commands', () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = new CommandRegistry();
    registerBuiltinCommands(registry);
  });

  describe('/help', () => {
    it('should list commands', async () => {
      const result = await registry.execute('/help', defaultContext);
      expect(result.type).toBe('output');
      if (result.type === 'output') {
        expect(result.text).toContain('/help');
        expect(result.text).toContain('/clear');
        expect(result.text).toContain('/compact');
      }
    });

    it('should show command details', async () => {
      const result = await registry.execute('/help help', defaultContext);
      expect(result.type).toBe('output');
      if (result.type === 'output') {
        expect(result.text).toContain('/help');
        expect(result.text).toContain('Show available commands');
      }
    });

    it('should work with alias', async () => {
      const result = await registry.execute('/h', defaultContext);
      expect(result.type).toBe('output');
    });
  });

  describe('/clear', () => {
    it('should return clear result', async () => {
      const result = await registry.execute('/clear', defaultContext);
      expect(result).toEqual({ type: 'clear' });
    });

    it('should work with alias /cls', async () => {
      const result = await registry.execute('/cls', defaultContext);
      expect(result).toEqual({ type: 'clear' });
    });
  });

  describe('/compact', () => {
    it('should return compact result', async () => {
      const result = await registry.execute('/compact', defaultContext);
      expect(result).toEqual({ type: 'compact' });
    });
  });

  describe('/status', () => {
    it('should return status info', async () => {
      const result = await registry.execute('/status', defaultContext);
      expect(result.type).toBe('output');
      if (result.type === 'output') {
        expect(result.text).toContain('/test');
        expect(result.text).toContain('gpt-5.4');
        expect(result.text).toContain('test-session');
      }
    });
  });

  describe('/echo', () => {
    it('should echo text', async () => {
      const result = await registry.execute('/echo hello', defaultContext);
      expect(result).toEqual({ type: 'output', text: 'hello' });
    });

    it('should be hidden', () => {
      const cmd = registry.get('echo');
      expect(cmd?.hidden).toBe(true);
    });
  });

  describe('/skills', () => {
    it('should return skills info', async () => {
      const result = await registry.execute('/skills', defaultContext);
      expect(result.type).toBe('output');
      if (result.type === 'output') {
        expect(result.text).toContain('Skills');
      }
    });
  });

  describe('/reset', () => {
    it('should return clear result', async () => {
      const result = await registry.execute('/reset', defaultContext);
      expect(result).toEqual({ type: 'clear' });
    });

    it('should be hidden', () => {
      const cmd = registry.get('reset');
      expect(cmd?.hidden).toBe(true);
    });
  });

  describe('/tools', () => {
    it('should be registered with name "tools"', () => {
      const cmd = registry.get('tools');
      expect(cmd).toBeDefined();
      expect(cmd!.name).toBe('tools');
    });

    it('should be accessible via alias "tls"', () => {
      const cmd = registry.get('tls');
      expect(cmd).toBeDefined();
      expect(cmd!.name).toBe('tools');
    });

    it('should return output with tool listing', async () => {
      const result = await registry.execute('/tools', defaultContext);
      expect(result.type).toBe('output');
      if (result.type === 'output') {
        // Either shows the registered tools or indicates unavailability in test context
        expect(
          result.text.includes('Registered Tools') || result.text.includes('not available')
        ).toBe(true);
      }
    });

    it('should work via alias /tls', async () => {
      const result = await registry.execute('/tls', defaultContext);
      expect(result.type).toBe('output');
    });
  });

  describe('/model', () => {
    it('should be registered with name "model"', () => {
      const cmd = registry.get('model');
      expect(cmd).toBeDefined();
      expect(cmd!.name).toBe('model');
    });

    it('should be accessible via alias "m"', () => {
      const cmd = registry.get('m');
      expect(cmd).toBeDefined();
      expect(cmd!.name).toBe('model');
    });

    it('should show current model without args', async () => {
      const result = await registry.execute('/model', defaultContext);
      expect(result.type).toBe('output');
      if (result.type === 'output') {
        expect(result.text).toContain('gpt-5.4');
      }
    });

    it('should return noop when args provided', async () => {
      const result = await registry.execute('/model claude-3.5', defaultContext);
      expect(result).toEqual({ type: 'noop' });
    });
  });

  describe('/history', () => {
    it('should be registered with name "history"', () => {
      const cmd = registry.get('history');
      expect(cmd).toBeDefined();
      expect(cmd!.name).toBe('history');
    });

    it('should be accessible via alias "hist"', () => {
      const cmd = registry.get('hist');
      expect(cmd).toBeDefined();
      expect(cmd!.name).toBe('history');
    });

    it('should return output about history', async () => {
      const result = await registry.execute('/history', defaultContext);
      expect(result.type).toBe('output');
      if (result.type === 'output') {
        expect(result.text).toContain('history');
      }
    });

    it('should work via alias /hist', async () => {
      const result = await registry.execute('/hist', defaultContext);
      expect(result.type).toBe('output');
    });
  });

  describe('/memory', () => {
    it('should be registered with name "memory"', () => {
      const cmd = registry.get('memory');
      expect(cmd).toBeDefined();
      expect(cmd!.name).toBe('memory');
    });

    it('should be accessible via alias "mem"', () => {
      const cmd = registry.get('mem');
      expect(cmd).toBeDefined();
      expect(cmd!.name).toBe('memory');
    });

    it('should return memory statistics', async () => {
      const result = await registry.execute('/memory', defaultContext);
      expect(result.type).toBe('output');
      if (result.type === 'output') {
        expect(result.text).toContain('Memory Statistics');
        expect(result.text).toContain('Total memories');
      }
    });

    it('should work via alias /mem', async () => {
      const result = await registry.execute('/mem', defaultContext);
      expect(result.type).toBe('output');
    });
  });

  describe('/config', () => {
    it('should be registered with name "config"', () => {
      const cmd = registry.get('config');
      expect(cmd).toBeDefined();
      expect(cmd!.name).toBe('config');
    });

    it('should be accessible via alias "cfg"', () => {
      const cmd = registry.get('cfg');
      expect(cmd).toBeDefined();
      expect(cmd!.name).toBe('config');
    });

    it('should show current config without args', async () => {
      const result = await registry.execute('/config', defaultContext);
      expect(result.type).toBe('output');
      if (result.type === 'output') {
        expect(result.text).toContain('Current Configuration');
        expect(result.text).toContain('gpt-5.4');
        expect(result.text).toContain('/test');
      }
    });

    it('should show specific config key', async () => {
      const result = await registry.execute('/config model', defaultContext);
      expect(result.type).toBe('output');
      if (result.type === 'output') {
        expect(result.text).toContain('model');
        expect(result.text).toContain('gpt-5.4');
      }
    });

    it('should return error for unknown config key', async () => {
      const result = await registry.execute('/config nonexistent_key', defaultContext);
      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.message).toContain('Unknown config key');
      }
    });

    it('should resolve env variable if set', async () => {
      const ctxWithEnv = { ...defaultContext, env: { MY_VAR: 'hello' } };
      const result = await registry.execute('/config MY_VAR', ctxWithEnv);
      expect(result.type).toBe('output');
      if (result.type === 'output') {
        expect(result.text).toContain('MY_VAR');
        expect(result.text).toContain('hello');
      }
    });
  });

  describe('/export', () => {
    it('should be registered with name "export"', () => {
      const cmd = registry.get('export');
      expect(cmd).toBeDefined();
      expect(cmd!.name).toBe('export');
    });

    it('should be accessible via alias "exp"', () => {
      const cmd = registry.get('exp');
      expect(cmd).toBeDefined();
      expect(cmd!.name).toBe('export');
    });

    it('should return error without filename', async () => {
      const result = await registry.execute('/export', defaultContext);
      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.message).toContain('Usage');
      }
    });

    it('should export to specified filename', async () => {
      const result = await registry.execute('/export conversation.md', defaultContext);
      expect(result.type).toBe('output');
      if (result.type === 'output') {
        expect(result.text).toContain('conversation.md');
        expect(result.text).toContain('exported');
      }
    });

    it('should work via alias /exp', async () => {
      const result = await registry.execute('/exp output.json', defaultContext);
      expect(result.type).toBe('output');
      if (result.type === 'output') {
        expect(result.text).toContain('output.json');
      }
    });
  });
});
