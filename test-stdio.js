#!/usr/bin/env node
/**
 * Test stdio communication with installed upup
 */

import { spawn } from 'child_process';

const proc = spawn('upup', ['--stdio'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let responseData = '';
let initialized = false;

// Handle stdout
proc.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(Boolean);
  for (const line of lines) {
    console.log('[STDOUT]', line);
    try {
      const msg = JSON.parse(line);
      if (msg.result) {
        console.log('[INIT RESULT]', JSON.stringify(msg.result, null, 2));
        initialized = true;
      }
    } catch (e) {
      // Not JSON
    }
  }
});

// Handle stderr
proc.stderr.on('data', (data) => {
  console.log('[STDERR]', data.toString());
});

proc.on('exit', (code) => {
  console.log('[EXIT]', code);
  process.exit(0);
});

// Send initialize request
setTimeout(() => {
  const initReq = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      clientName: 'sdk-test',
      clientVersion: '1.0.0',
      capabilities: { streaming: true, tools: true }
    }
  };
  console.log('[SEND]', JSON.stringify(initReq));
  proc.stdin.write(JSON.stringify(initReq) + '\n');
}, 500);

// Send run request after init
setTimeout(() => {
  if (initialized) {
    const runReq = {
      jsonrpc: '2.0',
      id: 2,
      method: 'run',
      params: {
        prompt: 'Hello, say hi in one word'
      }
    };
    console.log('[SEND]', JSON.stringify(runReq));
    proc.stdin.write(JSON.stringify(runReq) + '\n');
  }
}, 1500);

// Cleanup
setTimeout(() => {
  console.log('[TIMEOUT - CLEANUP]');
  proc.kill();
  process.exit(0);
}, 8000);
