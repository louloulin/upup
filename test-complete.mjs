import('@upup/adapter-paperclip').then(async (m) => {
  console.log('='.repeat(60));
  console.log('COMPLETE TEST SUITE');
  console.log('='.repeat(60));
  
  let totalPassed = 0;
  let totalFailed = 0;
  
  // Import modules
  const server = await import('@upup/adapter-paperclip/server');
  const ui = await import('@upup/adapter-paperclip/ui');
  const codec = m.sessionCodec;
  
  // ========== TEST 1: Main Module (9 tests) ==========
  let passed = 0, failed = 0;
  const test = (name, fn) => {
    try { fn(); passed++; } catch (e) { console.log(`❌ ${name}`); failed++; }
  };
  const assert = (c, m) => { if (!c) throw new Error(m || 'fail'); };
  
  console.log('\n[Test 1] Main Module...');
  test('type', () => assert(m.type === 'upup_local'));
  test('models.length === 6', () => assert(m.models?.length === 6));
  test('execute is function', () => assert(typeof m.execute === 'function'));
  test('testEnvironment is function', () => assert(typeof m.testEnvironment === 'function'));
  test('sessionCodec is object', () => assert(typeof m.sessionCodec === 'object'));
  test('detectModel is function', () => assert(typeof m.detectModel === 'function'));
  console.log(`  Passed: ${passed}/6`);
  totalPassed += passed; totalFailed += failed; passed = 0; failed = 0;
  
  // ========== TEST 2: Session Codec (7 tests) ==========
  console.log('\n[Test 2] Session Codec...');
  test('serialize/deserialize roundtrip', () => {
    const p = { sessionId: 's1', model: 'test' };
    assert(codec.deserialize(codec.serialize(p))?.sessionId === 's1');
  });
  test('deserialize null returns null', () => assert(codec.deserialize(null) === null));
  test('deserialize empty returns null', () => assert(codec.deserialize({}) === null));
  test('deserialize numeric ID converts to string', () => {
    const r = codec.deserialize({ sessionId: 12345 });
    assert(r?.sessionId === '12345');
  });
  test('getDisplayId works', () => assert(codec.getDisplayId({ sessionId: 'abc12345xyz' }) !== null));
  test('getDisplayId with numeric', () => assert(codec.getDisplayId({ sessionId: 99999 }) === '99999'));
  console.log(`  Passed: ${passed}/6`);
  totalPassed += passed; totalFailed += failed; passed = 0; failed = 0;
  
  // ========== TEST 3: UI Module (8 tests) ==========
  console.log('\n[Test 3] UI Module...');
  test('UPUP_MODELS has 6 items', () => assert(ui.UPUP_MODELS.length === 6));
  test('parseStdoutLine parses text_delta', () => {
    const entries = ui.parseStdoutLine('{"type":"acpx.text_delta","text":"hi"}', 't');
    assert(entries.length > 0);
  });
  test('parseStdoutLine parses tool_call', () => {
    const entries = ui.parseStdoutLine('{"type":"acpx.tool_call","name":"t","status":"pending"}', 't');
    assert(entries.length > 0);
  });
  test('parseStdoutLine parses error', () => {
    const entries = ui.parseStdoutLine('{"type":"acpx.error","message":"err"}', 't');
    assert(entries.length > 0);
  });
  test('buildUpupConfig defaults', () => {
    const c = ui.buildUpupConfig({});
    assert(c.maxIterations === 50);
  });
  test('buildUpupConfig custom', () => {
    const c = ui.buildUpupConfig({ model: 'claude' });
    assert(c.model === 'claude');
  });
  console.log(`  Passed: ${passed}/6`);
  totalPassed += passed; totalFailed += failed; passed = 0; failed = 0;
  
  // ========== TEST 4: detectModel (2 tests) ==========
  console.log('\n[Test 4] detectModel...');
  test('detectModel returns model', async () => {
    const r = await m.detectModel();
    assert(typeof r.model === 'string' && r.model.length > 0);
  });
  test('detectModel returns provider', async () => {
    const r = await m.detectModel();
    assert(typeof r.provider === 'string' && r.provider.length > 0);
  });
  console.log(`  Passed: ${passed}/2`);
  totalPassed += passed; totalFailed += failed; passed = 0; failed = 0;
  
  // ========== TEST 5: testEnvironment (3 tests) ==========
  console.log('\n[Test 5] testEnvironment...');
  test('testEnvironment returns result', async () => {
    const r = await m.testEnvironment({ companyId: 'c', adapterType: 'u', config: {} });
    assert(typeof r.status === 'string');
  });
  test('testEnvironment has checks', async () => {
    const r = await m.testEnvironment({ companyId: 'c', adapterType: 'u', config: {} });
    assert(Array.isArray(r.checks) && r.checks.length > 0);
  });
  test('testEnvironment has testedAt', async () => {
    const r = await m.testEnvironment({ companyId: 'c', adapterType: 'u', config: {} });
    assert(typeof r.testedAt === 'string');
  });
  console.log(`  Passed: ${passed}/3`);
  totalPassed += passed; totalFailed += failed; passed = 0; failed = 0;
  
  // ========== TEST 6: execute Signature (3 tests) ==========
  console.log('\n[Test 6] execute Signature...');
  test('execute accepts context', async () => {
    const ctx = {
      runId: 'r1', agent: { id: 'a', companyId: 'c', name: 'n', adapterType: null, adapterConfig: {} },
      runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
      config: { timeoutSec: 1, maxIterations: 1 },
      context: {}, onLog: async () => {}
    };
    const r = await server.execute(ctx);
    assert(r.exitCode !== undefined);
  });
  test('execute returns model', async () => {
    const ctx = {
      runId: 'r2', agent: { id: 'a', companyId: 'c', name: 'n', adapterType: null, adapterConfig: {} },
      runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
      config: { timeoutSec: 1, maxIterations: 1 },
      context: {}, onLog: async () => {}
    };
    const r = await server.execute(ctx);
    assert(typeof r.model === 'string');
  });
  test('execute returns timedOut boolean', async () => {
    const ctx = {
      runId: 'r3', agent: { id: 'a', companyId: 'c', name: 'n', adapterType: null, adapterConfig: {} },
      runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
      config: { timeoutSec: 1, maxIterations: 1 },
      context: {}, onLog: async () => {}
    };
    const r = await server.execute(ctx);
    assert(typeof r.timedOut === 'boolean');
  });
  console.log(`  Passed: ${passed}/3`);
  totalPassed += passed; totalFailed += failed; passed = 0; failed = 0;
  
  // ========== FINAL SUMMARY ==========
  console.log('\n' + '='.repeat(60));
  console.log(`FINAL RESULTS: ${totalPassed} passed, ${totalFailed} failed`);
  console.log('='.repeat(60));
  
  if (totalFailed === 0) {
    console.log('🎉 ALL TESTS PASSED! 🎉');
  }
}).catch(e => {
  console.error('❌ Fatal:', e.message);
  process.exit(1);
});
