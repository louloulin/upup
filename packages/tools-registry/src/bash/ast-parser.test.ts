/**
 * Tests for Bash AST Parser
 */

import { describe, it, expect } from 'bun:test';
import {
  parseForSecurity,
  stripWrappers,
  getBaseCommand,
  hasDangerousBuiltin,
  classifyFromAST,
  type SimpleCommand,
} from './ast-parser.js';

describe('parseForSecurity', () => {
  it('parses simple commands', () => {
    const result = parseForSecurity('ls -la /tmp');
    expect(result.kind).toBe('simple');
    if (result.kind === 'simple') {
      expect(result.commands).toHaveLength(1);
      expect(result.commands[0].argv).toEqual(['ls', '-la', '/tmp']);
    }
  });

  it('parses piped commands', () => {
    const result = parseForSecurity('cat file.txt | grep hello');
    expect(result.kind).toBe('simple');
    if (result.kind === 'simple') {
      expect(result.commands).toHaveLength(2);
      expect(result.commands[0].argv).toEqual(['cat', 'file.txt']);
      expect(result.commands[1].argv).toEqual(['grep', 'hello']);
    }
  });

  it('parses && chained commands', () => {
    const result = parseForSecurity('npm test && npm build');
    expect(result.kind).toBe('simple');
    if (result.kind === 'simple') {
      expect(result.commands).toHaveLength(2);
    }
  });

  it('parses ; separated commands', () => {
    const result = parseForSecurity('echo hello; echo world');
    expect(result.kind).toBe('simple');
    if (result.kind === 'simple') {
      expect(result.commands).toHaveLength(2);
    }
  });

  it('handles quoted strings correctly', () => {
    const result = parseForSecurity('echo "hello world" \'foo bar\'');
    expect(result.kind).toBe('simple');
    if (result.kind === 'simple') {
      expect(result.commands[0].argv).toEqual(['echo', 'hello world', 'foo bar']);
    }
  });

  it('handles env var assignments', () => {
    const result = parseForSecurity('NODE_ENV=production npm start');
    expect(result.kind).toBe('simple');
    if (result.kind === 'simple') {
      expect(result.commands[0].envVars).toEqual([
        { name: 'NODE_ENV', value: 'production' },
      ]);
      expect(result.commands[0].argv).toEqual(['npm', 'start']);
    }
  });

  it('returns too-complex for command substitution $()', () => {
    const result = parseForSecurity('echo $(whoami)');
    expect(result.kind).toBe('too-complex');
  });

  it('returns too-complex for backtick substitution', () => {
    const result = parseForSecurity('echo `whoami`');
    expect(result.kind).toBe('too-complex');
  });

  it('returns too-complex for process substitution', () => {
    const result = parseForSecurity('diff <(ls dir1) <(ls dir2)');
    expect(result.kind).toBe('too-complex');
  });

  it('returns too-complex for shell control structures', () => {
    const result = parseForSecurity('if [ -f file ]; then echo yes; fi');
    expect(result.kind).toBe('too-complex');
  });

  it('returns too-complex for here documents', () => {
    const result = parseForSecurity('cat << EOF\nhello\nEOF');
    expect(result.kind).toBe('too-complex');
  });

  it('returns simple for empty command', () => {
    const result = parseForSecurity('   ');
    expect(result.kind).toBe('simple');
    if (result.kind === 'simple') {
      expect(result.commands).toHaveLength(0);
    }
  });
});

describe('stripWrappers', () => {
  it('strips timeout wrapper', () => {
    const cmd: SimpleCommand = {
      argv: ['timeout', '30', 'curl', 'https://example.com'],
      text: 'timeout 30 curl https://example.com',
      envVars: [],
      redirects: [],
    };
    const stripped = stripWrappers(cmd);
    expect(stripped.argv).toEqual(['curl', 'https://example.com']);
  });

  it('strips time wrapper', () => {
    const cmd: SimpleCommand = {
      argv: ['time', 'ls', '-la'],
      text: 'time ls -la',
      envVars: [],
      redirects: [],
    };
    const stripped = stripWrappers(cmd);
    expect(stripped.argv).toEqual(['ls', '-la']);
  });

  it('strips nice wrapper', () => {
    const cmd: SimpleCommand = {
      argv: ['nice', 'make', 'build'],
      text: 'nice make build',
      envVars: [],
      redirects: [],
    };
    const stripped = stripWrappers(cmd);
    expect(stripped.argv).toEqual(['make', 'build']);
  });

  it('strips nested wrappers', () => {
    const cmd: SimpleCommand = {
      argv: ['timeout', '60', 'time', 'npm', 'test'],
      text: 'timeout 60 time npm test',
      envVars: [],
      redirects: [],
    };
    const stripped = stripWrappers(cmd);
    expect(stripped.argv).toEqual(['npm', 'test']);
  });

  it('strips leading env vars from argv', () => {
    const cmd: SimpleCommand = {
      argv: ['NODE_ENV=test', 'npm', 'start'],
      text: 'NODE_ENV=test npm start',
      envVars: [],
      redirects: [],
    };
    const stripped = stripWrappers(cmd);
    expect(stripped.argv).toEqual(['npm', 'start']);
  });
});

describe('getBaseCommand', () => {
  it('returns base command', () => {
    const cmd: SimpleCommand = {
      argv: ['ls', '-la', '/tmp'],
      text: 'ls -la /tmp',
      envVars: [],
      redirects: [],
    };
    expect(getBaseCommand(cmd)).toBe('ls');
  });

  it('returns base command after stripping wrappers', () => {
    const cmd: SimpleCommand = {
      argv: ['timeout', '30', 'curl', 'example.com'],
      text: 'timeout 30 curl example.com',
      envVars: [],
      redirects: [],
    };
    expect(getBaseCommand(cmd)).toBe('curl');
  });
});

describe('hasDangerousBuiltin', () => {
  it('detects eval', () => {
    const cmd: SimpleCommand = {
      argv: ['eval', '$malicious'],
      text: 'eval $malicious',
      envVars: [],
      redirects: [],
    };
    expect(hasDangerousBuiltin(cmd)).toBe(true);
  });

  it('detects exec', () => {
    const cmd: SimpleCommand = {
      argv: ['exec', 'bash'],
      text: 'exec bash',
      envVars: [],
      redirects: [],
    };
    expect(hasDangerousBuiltin(cmd)).toBe(true);
  });

  it('allows safe commands', () => {
    const cmd: SimpleCommand = {
      argv: ['ls', '-la'],
      text: 'ls -la',
      envVars: [],
      redirects: [],
    };
    expect(hasDangerousBuiltin(cmd)).toBe(false);
  });
});

describe('classifyFromAST', () => {
  it('classifies ls as read', () => {
    const cmd: SimpleCommand = {
      argv: ['ls', '-la'],
      text: 'ls -la',
      envVars: [],
      redirects: [],
    };
    expect(classifyFromAST(cmd)).toBe('read');
  });

  it('classifies cat as read', () => {
    const cmd: SimpleCommand = {
      argv: ['cat', 'file.txt'],
      text: 'cat file.txt',
      envVars: [],
      redirects: [],
    };
    expect(classifyFromAST(cmd)).toBe('read');
  });

  it('classifies grep as read', () => {
    const cmd: SimpleCommand = {
      argv: ['grep', '-r', 'pattern', '.'],
      text: 'grep -r pattern .',
      envVars: [],
      redirects: [],
    };
    expect(classifyFromAST(cmd)).toBe('read');
  });

  it('classifies rm as write', () => {
    const cmd: SimpleCommand = {
      argv: ['rm', '-rf', '/tmp/test'],
      text: 'rm -rf /tmp/test',
      envVars: [],
      redirects: [],
    };
    expect(classifyFromAST(cmd)).toBe('write');
  });

  it('classifies npm install as write', () => {
    const cmd: SimpleCommand = {
      argv: ['npm', 'install', 'express'],
      text: 'npm install express',
      envVars: [],
      redirects: [],
    };
    expect(classifyFromAST(cmd)).toBe('write');
  });

  it('classifies npm list as read', () => {
    const cmd: SimpleCommand = {
      argv: ['npm', 'list', '--depth=0'],
      text: 'npm list --depth=0',
      envVars: [],
      redirects: [],
    };
    expect(classifyFromAST(cmd)).toBe('read');
  });

  it('classifies git status as read', () => {
    const cmd: SimpleCommand = {
      argv: ['git', 'status'],
      text: 'git status',
      envVars: [],
      redirects: [],
    };
    expect(classifyFromAST(cmd)).toBe('read');
  });

  it('classifies git push as write', () => {
    const cmd: SimpleCommand = {
      argv: ['git', 'push', 'origin', 'main'],
      text: 'git push origin main',
      envVars: [],
      redirects: [],
    };
    expect(classifyFromAST(cmd)).toBe('write');
  });

  it('classifies docker ps as read', () => {
    const cmd: SimpleCommand = {
      argv: ['docker', 'ps'],
      text: 'docker ps',
      envVars: [],
      redirects: [],
    };
    expect(classifyFromAST(cmd)).toBe('read');
  });

  it('classifies docker run as write', () => {
    const cmd: SimpleCommand = {
      argv: ['docker', 'run', '-d', 'nginx'],
      text: 'docker run -d nginx',
      envVars: [],
      redirects: [],
    };
    expect(classifyFromAST(cmd)).toBe('write');
  });

  it('classifies unknown commands as unknown', () => {
    const cmd: SimpleCommand = {
      argv: ['my-custom-tool'],
      text: 'my-custom-tool',
      envVars: [],
      redirects: [],
    };
    expect(classifyFromAST(cmd)).toBe('unknown');
  });

  it('classifies read command with file redirect as write', () => {
    const cmd: SimpleCommand = {
      argv: ['echo', 'hello'],
      text: 'echo hello > /tmp/test.txt',
      envVars: [],
      redirects: [{ type: '>', target: '/tmp/test.txt' }],
    };
    expect(classifyFromAST(cmd)).toBe('write');
  });
});
