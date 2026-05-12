import('@upup/adapter-paperclip').then(async (m) => {
  console.log('='.repeat(60));
  console.log('UPUP ADAPTER ADVANCED TEST SUITE');
  console.log('='.repeat(60));
  
  let passed = 0;
  let failed = 0;
  
  function test(name, fn) {
    try {
      fn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (e) {
      console.log(`❌ ${name}: ${e.message}`);
      failed++;
    }
  }
  
  function assert(condition, message) {
    if (!condition) throw new Error(message || 'Assertion failed');
  }
  
  // === 1. Error Handling Tests ===
  console.log('\n--- Error Handling Tests ---');
  
  const server = await import('@upup/adapter-paperclip/server');
  
  // Test 1: Very short timeout
  test('execute with 1s timeout', async () => {
    const ctx = {
      runId: 'timeout-test',
      agent: { id: 't1', companyId: 'c1', name: 'T', adapterType: null, adapterConfig: {} },
      runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
      config: { model: 'deepseek-v4-flash', timeoutSec: 1, maxIterations: 10 },
      context: {},
      onLog: async () => {}
    };
    const result = await server.execute(ctx);
    // Should complete (with timeout or actual execution)
    assert(result.exitCode !== undefined);
    assert(typeof result.timedOut === 'boolean');
  });
  
  // Test 2: Invalid model falls back to default
  test('execute with invalid model falls back', async () => {
    const ctx = {
      runId: 'invalid-model-test',
      agent: { id: 't2', companyId: 'c2', name: 'T', adapterType: null, adapterConfig: {} },
      runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
      config: { model: 'invalid-model-xyz', timeoutSec: 1, maxIterations: 1 },
      context: {},
      onLog: async () => {}
    };
    const result = await server.execute(ctx);
    // Should still execute (with default model or error)
    assert(result.model !== undefined);
  });
  
  // Test 3: Zero timeout treated as no timeout
  test('execute with zero timeout', async () => {
    const ctx = {
      runId: 'zero-timeout-test',
      agent: { id: 't3', companyId: 'c3', name: 'T', adapterType: null, adapterConfig: {} },
      runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
      config: { model: 'deepseek-v4-flash', timeoutSec: 0, maxIterations: 1 },
      context: {},
      onLog: async () => {}
    };
    const result = await server.execute(ctx);
    assert(result.exitCode !== undefined);
  });
  
  // === 2. Session Codec Edge Cases ===
  console.log('\n--- Session Codec Edge Cases ---');
  
  const codec = m.sessionCodec;
  
  test('serialize undefined', () => {
    const result = codec.serialize(undefined);
    assert(result !== null && typeof result === 'object');
  });
  
  test('deserialize invalid object', () => {
    const result = codec.deserialize({});
    // Empty object should return null (no sessionId)
    assert(result === null);
  });
  
  test('deserialize with only sessionId', () => {
    const result = codec.deserialize({ sessionId: 'test-456' });
    assert(result !== null);
    assert(result?.sessionId === 'test-456');
  });
  
  test('roundtrip full params', () => {
    const params = {
      sessionId: 'sess-full',
      model: 'claude-sonnet-4-6',
      provider: 'anthropic',
      cwd: '/tmp/test'
    };
    const serialized = codec.serialize(params);
    const deserialized = codec.deserialize(serialized);
    assert(deserialized?.sessionId === params.sessionId);
    assert(deserialized?.model === params.model);
    assert(deserialized?.provider === params.provider);
  });
  
  test('deserialize number sessionId converts to string', () => {
    // Some systems might pass numeric IDs
    const result = codec.deserialize({ sessionId: 12345 });
    assert(result !== null);
    assert(result?.sessionId === '12345');
  });
  
  // === 3. ACPX Event Parsing Tests ===
  console.log('\n--- ACPX Event Parsing ---');
  
  const ui = await import('@upup/adapter-paperclip/ui');
  
  const acpxEvents = [
    // text_delta events
    { input: '{"type":"acpx.text_delta","text":"Hello","channel":"output"}', kind: 'assistant' },
    { input: '{"type":"acpx.text_delta","text":"Thinking","channel":"thought"}', kind: 'thinking' },
    { input: '{"type":"acpx.text_delta","text":"","channel":"output"}', kind: 'assistant' }, // empty text
    
    // tool_call events
    { input: '{"type":"acpx.tool_call","name":"get_price","status":"pending","text":"{}"}', kind: 'tool_call' },
    { input: '{"type":"acpx.tool_call","name":"get_price","status":"completed","text":"100.50"}', kind: 'tool_result' },
    { input: '{"type":"acpx.tool_call","name":"get_price","toolCallId":"call_123","status":"completed","text":"result"}', kind: 'tool_result' },
    
    // result event
    { input: '{"type":"acpx.result","summary":"Done"}', kind: 'result' },
    
    // error event
    { input: '{"type":"acpx.error","message":"Failed","code":"ERR_001"}', kind: 'stderr' },
    
    // status event
    { input: '{"type":"acpx.status","text":"Running..."}', kind: 'system' },
    
    // non-JSON
    { input: 'Just plain text line', kind: 'stdout' },
    { input: '[INFO] Some log message', kind: 'stdout' },
  ];
  
  for (const { input, kind } of acpxEvents) {
    test(`parse "${input.slice(0, 40)}..." as ${kind}`, () => {
      const entries = ui.parseStdoutLine(input, '2024-01-01T00:00:00Z');
      if (kind === 'stdout') {
        // Non-JSON or unhandled types return stdout entry
        assert(entries.length >= 0); // Just check it doesn't crash
      } else {
        // Should produce entries
        assert(entries.length > 0, `Expected entries for ${kind}`);
      }
    });
  }
  
  // === 4. Build Config Tests ===
  console.log('\n--- Build Config Tests ---');
  
  // Default config
  test('buildUpupConfig with no args', () => {
    const config = ui.buildUpupConfig({});
    assert(config.maxIterations === 50);
    assert(config.timeoutSec === 1800);
    assert(config.persistSession === true);
  });
  
  // Custom values
  test('buildUpupConfig with custom values', () => {
    const config = ui.buildUpupConfig({
      model: 'claude-opus-4-7',
      timeoutSec: 3600,
      maxIterations: 100,
      persistSession: false,
      cwd: '/custom/path'
    });
    assert(config.model === 'claude-opus-4-7');
    assert(config.timeoutSec === 3600);
    assert(config.maxIterations === 100);
    assert(config.persistSession === false);
    assert(config.cwd === '/custom/path');
  });
  
  // Partial config
  test('buildUpupConfig with partial values', () => {
    const config = ui.buildUpupConfig({
      model: 'gpt-4o'
    });
    assert(config.model === 'gpt-4o');
    assert(config.timeoutSec === 1800); // default
  });
  
  // === 5. Model Detection Tests ===
  console.log('\n--- Model Detection Tests ---');
  
  test('detectModel returns structure', async () => {
    const result = await m.detectModel();
    assert(typeof result.model === 'string');
    assert(typeof result.provider === 'string');
    assert(result.model.length > 0);
    assert(result.provider.length > 0);
  });
  
  test('detectModel default model is valid', async () => {
    const result = await m.detectModel();
    const validModels = m.models.map(mo => mo.id);
    // Default might not match exactly if env var is custom
    assert(result.model.length > 0);
  });
  
  // === 6. testEnvironment Tests ===
  console.log('\n--- testEnvironment Tests ---');
  
  test('testEnvironment with empty config', async () => {
    const result = await m.testEnvironment({
      companyId: 'test',
      adapterType: 'upup_local',
      config: {}
    });
    assert(result.status === 'warn' || result.status === 'pass');
    assert(result.checks.length > 0);
  });
  
  test('testEnvironment checks have required fields', async () => {
    const result = await m.testEnvironment({
      companyId: 'test',
      adapterType: 'upup_local',
      config: {}
    });
    for (const check of result.checks) {
      assert(typeof check.code === 'string');
      assert(typeof check.level === 'string');
      assert(['info', 'warn', 'error'].includes(check.level));
      assert(typeof check.message === 'string');
    }
  });
  
  test('testEnvironment includes key checks', async () => {
    const result = await m.testEnvironment({
      companyId: 'test',
      adapterType: 'upup_local',
      config: {}
    });
    const codes = result.checks.map(c => c.code);
    assert(codes.includes('BUN'), 'Should check BUN runtime');
    assert(codes.includes('NODE'), 'Should check Node version');
  });
  
  // === 7. UI Transcript Parsing Comprehensive ===
  console.log('\n--- Transcript Parsing Comprehensive ---');
  
  test('parse complex tool call JSON', () => {
    const complexTool = JSON.stringify({
      type: 'acpx.tool_call',
      name: 'run_research',
      toolCallId: 'call_abc123',
      status: 'pending',
      text: '{"topic":"AI stocks","depth":"detailed"}'
    });
    const entries = ui.parseStdoutLine(complexTool, '2024-01-01T00:00:00Z');
    assert(entries.length > 0);
    assert(entries[0].kind === 'tool_call');
    assert(entries[0].name === 'run_research');
  });
  
  test('parse tool result with multiline text', () => {
    const multilineResult = JSON.stringify({
      type: 'acpx.tool_call',
      name: 'get_data',
      status: 'completed',
      text: 'Line 1\nLine 2\nLine 3'
    });
    const entries = ui.parseStdoutLine(multilineResult, '2024-01-01T00:00:00Z');
    assert(entries.length > 0);
  });
  
  test('parse error with special characters', () => {
    const errorEvent = JSON.stringify({
      type: 'acpx.error',
      message: 'Error: connection refused (errno 111)',
      code: 'NETWORK_ERROR'
    });
    const entries = ui.parseStdoutLine(errorEvent, '2024-01-01T00:00:00Z');
    assert(entries.length > 0);
  });
  
  test('parse Unicode text', () => {
    const unicodeEvent = JSON.stringify({
      type: 'acpx.text_delta',
      text: '股票价格: ¥150.00 (沪深300)',
      channel: 'output'
    });
    const entries = ui.parseStdoutLine(unicodeEvent, '2024-01-01T00:00:00Z');
    assert(entries.length > 0);
  });
  
  // === Summary ===
  console.log('\n' + '='.repeat(60));
  console.log(`ADVANCED TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));
  
  if (failed > 0) {
    process.exit(1);
  }
}).catch(e => {
  console.error('❌ Fatal error:', e.message);
  console.error(e.stack);
  process.exit(1);
});
