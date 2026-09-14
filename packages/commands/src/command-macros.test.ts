// @ts-nocheck
import { describe, test, expect, beforeEach } from 'bun:test';
import { CommandRegistry, parseMacroFile, expandMacro } from './commands.js';
import type { CommandContext } from './commands.js';

describe('Command Macros', () => {
  describe('parseMacroFile', () => {
    test('parses simple macro', () => {
      const content = `# Daily research routine
/status
/model
/history`;
      const macro = parseMacroFile(content, 'daily');
      expect(macro.name).toBe('daily');
      expect(macro.description).toBe('Daily research routine');
      expect(macro.steps).toHaveLength(3);
      expect(macro.steps[0].command).toBe('status');
      expect(macro.steps[1].command).toBe('model');
      expect(macro.steps[2].command).toBe('history');
    });

    test('parses macro with args', () => {
      const content = `/git status
/diff --stat
/commit auto save`;
      const macro = parseMacroFile(content, 'gitflow');
      expect(macro.steps).toHaveLength(3);
      expect(macro.steps[0].command).toBe('git');
      expect(macro.steps[0].args).toBe('status');
      expect(macro.steps[2].command).toBe('commit');
      expect(macro.steps[2].args).toBe('auto save');
    });

    test('parses macro with delay directives', () => {
      const content = `# Slow sequence
/status
## delay 1000
/model`;
      const macro = parseMacroFile(content, 'slow');
      expect(macro.steps).toHaveLength(2);
      expect(macro.steps[0].delayMs).toBeUndefined();
      expect(macro.steps[1].delayMs).toBe(1000);
    });

    test('handles empty content', () => {
      const macro = parseMacroFile('', 'empty');
      expect(macro.steps).toHaveLength(0);
      expect(macro.description).toBe('empty');
    });

    test('skips non-command lines', () => {
      const content = `# Description
This is a comment
/status
Another comment
/model`;
      const macro = parseMacroFile(content, 'mixed');
      expect(macro.steps).toHaveLength(2);
    });

    test('defaults stopOnError to true', () => {
      const macro = parseMacroFile('/status', 'test');
      expect(macro.stopOnError).toBe(true);
    });
  });

  describe('expandMacro', () => {
    test('expands to command strings', () => {
      const macro = parseMacroFile('/status\n/model gpt-4', 'test');
      const expanded = expandMacro(macro);
      expect(expanded).toEqual(['/status', '/model gpt-4']);
    });
  });

  describe('Macro execution via CommandRegistry', () => {
    let registry: CommandRegistry;
    const defaultContext: CommandContext = {
      cwd: '/tmp',
      env: {},
      sessionId: 'test',
      model: 'test-model',
      permission: 'admin',
    };

    beforeEach(() => {
      registry = new CommandRegistry();
      registry.register({
        name: 'step1',
        description: 'Step 1',
        async execute() { return { type: 'output', text: 'step1-done' }; },
      });
      registry.register({
        name: 'step2',
        description: 'Step 2',
        async execute(args) { return { type: 'output', text: `step2-${args}` }; },
      });
      registry.register({
        name: 'fail-step',
        description: 'Fails',
        async execute() { return { type: 'error', message: 'failed' }; },
      });
    });

    test('registers and executes a macro', async () => {
      const macro = parseMacroFile('/step1\n/step2 hello', 'test-macro');
      registry.register({
        name: 'test-macro',
        description: macro.description,
        async execute(_args, ctx) {
          const results: string[] = [];
          for (const step of macro.steps) {
            const cmd = step.args ? `/${step.command} ${step.args}` : `/${step.command}`;
            const result = await registry.execute(cmd, ctx);
            if (result.type === 'output') results.push(result.text);
            else if (result.type === 'error') results.push(`Error: ${result.message}`);
          }
          return { type: 'output', text: results.join('\n') };
        },
      });

      const result = await registry.execute('/test-macro', defaultContext);
      expect(result.type).toBe('output');
      if (result.type === 'output') {
        expect(result.text).toContain('step1-done');
        expect(result.text).toContain('step2-hello');
      }
    });

    test('macro stops on error by default', async () => {
      const macro = parseMacroFile('/step1\n/fail-step\n/step2 after-fail', 'fail-macro');
      let executedSteps: string[] = [];

      registry.register({
        name: 'fail-macro',
        description: macro.description,
        async execute(_args, ctx) {
          const results: string[] = [];
          for (const step of macro.steps) {
            executedSteps.push(step.command);
            const cmd = step.args ? `/${step.command} ${step.args}` : `/${step.command}`;
            const result = await registry.execute(cmd, ctx);
            if (result.type === 'output') results.push(result.text);
            else if (result.type === 'error') {
              results.push(`Error: ${result.message}`);
              if (macro.stopOnError !== false) break;
            }
          }
          return { type: 'output', text: results.join('\n') };
        },
      });

      const result = await registry.execute('/fail-macro', defaultContext);
      expect(result.type).toBe('output');
      // Should have executed step1 and fail-step but NOT step2
      expect(executedSteps).toEqual(['step1', 'fail-step']);
    });
  });
});
