/**
 * Coach 推送渠道测试(Sprint 1.3)。
 *
 * 覆盖:
 *   - types: readEnv / readEnvBool
 *   - cli: isEnabled 永远 true(门开) / UPUP_CLI_CHANNEL 关闭 / 写 stdout
 *   - wechat: 3 provider routing + 未配置时 ok:false 不抛错
 *   - feishu / dingtalk / email: 未配置 ok:false + 签名 / API 路径
 *   - registry: broadcast 聚合 + 单渠道失败不阻断其他 + register/unregister
 */
import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import {
  CliChannel,
  WechatChannel,
  FeishuChannel,
  DingtalkChannel,
  EmailChannel,
  ChannelRegistry,
  readEnv,
  readEnvBool,
  isChannelsCompiledIn,
} from './index.js';
import type { PushChannel, PushPayload } from './types.js';
import { featureGates } from '../../runtime/pi/feature-gates.js';

// 集中管理: 任何渠道相关 env,测试前后清零,避免污染
const ENV_KEYS = [
  'UPUP_CLI_CHANNEL',
  'UPUP_WECHAT_CHANNEL', 'UPUP_WECHAT_PROVIDER', 'UPUP_WECHAT_SENDKEY',
  'UPUP_WECHAT_CORP_ID', 'UPUP_WECHAT_CORP_SECRET', 'UPUP_WECHAT_AGENT_ID', 'UPUP_WECHAT_TO_USER',
  'UPUP_FEISHU_CHANNEL', 'UPUP_FEISHU_WEBHOOK', 'UPUP_FEISHU_SECRET',
  'UPUP_DINGTALK_CHANNEL', 'UPUP_DINGTALK_WEBHOOK', 'UPUP_DINGTALK_SECRET',
  'UPUP_EMAIL_CHANNEL', 'UPUP_EMAIL_PROVIDER', 'UPUP_EMAIL_API_KEY', 'UPUP_EMAIL_FROM', 'UPUP_EMAIL_TO',
  'BUN_CONFIG_FEATURE_COACH_MODE', 'BUN_CONFIG_FEATURE_KAIROS_CHANNELS',
  // types test
  'UPUP_TEST_ENV', 'UPUP_TEST_BOOL',
];

function clearEnv(): void {
  for (const k of ENV_KEYS) delete process.env[k];
}

function enableGates(): void {
  featureGates.set('COACH_MODE', { force: true });
  featureGates.set('KAIROS_CHANNELS', { force: true });
}

function disableGates(): void {
  featureGates.clearRuntime('COACH_MODE');
  featureGates.clearRuntime('KAIROS_CHANNELS');
}

const samplePayload: PushPayload = {
  title: 'Hello',
  body: 'World',
  url: 'https://example.com',
  tags: ['coach', 'test'],
  priority: 1,
};

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// types helpers
// ---------------------------------------------------------------------------

describe('types helpers', () => {
  beforeEach(() => clearEnv());

  test('readEnv returns undefined for missing key', () => {
    expect(readEnv('UPUP_DEFINITELY_NOT_SET_123')).toBeUndefined();
  });

  test('readEnv trims whitespace and skips empty', () => {
    process.env.UPUP_TEST_ENV = '  hello  ';
    expect(readEnv('UPUP_TEST_ENV')).toBe('hello');
    process.env.UPUP_TEST_ENV = '   ';
    expect(readEnv('UPUP_TEST_ENV')).toBeUndefined();
  });

  test('readEnvBool defaults: missing -> default', () => {
    expect(readEnvBool('UPUP_DEFINITELY_NOT_SET_123', true)).toBe(true);
    expect(readEnvBool('UPUP_DEFINITELY_NOT_SET_123', false)).toBe(false);
  });

  test('readEnvBool parses common forms', () => {
    for (const truthy of ['1', 'true', 'yes', 'on', 'TRUE', 'Yes']) {
      process.env.UPUP_TEST_BOOL = truthy;
      expect(readEnvBool('UPUP_TEST_BOOL', false)).toBe(true);
    }
    for (const falsy of ['0', 'false', 'no', 'off', 'NO']) {
      process.env.UPUP_TEST_BOOL = falsy;
      expect(readEnvBool('UPUP_TEST_BOOL', true)).toBe(false);
    }
  });

  test('readEnvBool unknown value falls back to default', () => {
    process.env.UPUP_TEST_BOOL = 'banana';
    expect(readEnvBool('UPUP_TEST_BOOL', true)).toBe(true);
    expect(readEnvBool('UPUP_TEST_BOOL', false)).toBe(false);
  });

  test('isChannelsCompiledIn reflects KAIROS_CHANNELS registration', () => {
    // KAIROS_CHANNELS is registered; with no env + no runtime force, defaultEnabled=false
    disableGates();
    expect(isChannelsCompiledIn()).toBe(false);
    enableGates();
    expect(isChannelsCompiledIn()).toBe(true);
    disableGates();
  });
});

// ---------------------------------------------------------------------------
// CliChannel
// ---------------------------------------------------------------------------

describe('CliChannel', () => {
  beforeEach(() => { clearEnv(); enableGates(); });
  afterEach(() => disableGates());

  test('isEnabled true when gates on', () => {
    expect(new CliChannel().isEnabled()).toBe(true);
  });

  test('isEnabled false when gates off', () => {
    disableGates();
    expect(new CliChannel().isEnabled()).toBe(false);
  });

  test('isEnabled respects UPUP_CLI_CHANNEL=false override', () => {
    process.env.UPUP_CLI_CHANNEL = 'false';
    expect(new CliChannel().isEnabled()).toBe(false);
  });

  test('send writes title + body to stdout', async () => {
    const writes: string[] = [];
    const spy = spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
      return true;
    }) as typeof process.stdout.write);
    const result = await new CliChannel().send(samplePayload);
    spy.mockRestore();
    expect(result.ok).toBe(true);
    const out = writes.join('');
    expect(out).toContain('Hello');
    expect(out).toContain('World');
    expect(out).toContain('https://example.com');
    expect(out).toContain('coach, test');
  });

  test('send ok:false when stdout.write throws', async () => {
    const spy = spyOn(process.stdout, 'write').mockImplementation((() => {
      throw new Error('epipe');
    }) as typeof process.stdout.write);
    const result = await new CliChannel().send(samplePayload);
    spy.mockRestore();
    expect(result.ok).toBe(false);
    expect(result.error).toBe('epipe');
  });
});

// ---------------------------------------------------------------------------
// WechatChannel
// ---------------------------------------------------------------------------

describe('WechatChannel unconfigured', () => {
  beforeEach(() => { clearEnv(); enableGates(); });
  afterEach(() => disableGates());

  test('isEnabled false without sendkey or corp env', () => {
    expect(new WechatChannel().isEnabled()).toBe(false);
  });

  test('send returns ok:false without throwing when unconfigured', async () => {
    const r = await new WechatChannel().send(samplePayload);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not configured/);
  });

  test('sct provider: enabled when sendkey set', () => {
    process.env.UPUP_WECHAT_SENDKEY = 'abc';
    expect(new WechatChannel().isEnabled()).toBe(true);
  });

  test('pushplus provider: enabled when sendkey set', () => {
    process.env.UPUP_WECHAT_PROVIDER = 'pushplus';
    process.env.UPUP_WECHAT_SENDKEY = 'tok';
    expect(new WechatChannel().isEnabled()).toBe(true);
  });

  test('corp provider: requires all 4 env vars', () => {
    process.env.UPUP_WECHAT_PROVIDER = 'corp';
    process.env.UPUP_WECHAT_CORP_ID = 'id';
    process.env.UPUP_WECHAT_CORP_SECRET = 'sec';
    process.env.UPUP_WECHAT_AGENT_ID = '1';
    process.env.UPUP_WECHAT_TO_USER = 'user';
    expect(new WechatChannel().isEnabled()).toBe(true);
    delete process.env.UPUP_WECHAT_AGENT_ID;
    expect(new WechatChannel().isEnabled()).toBe(false);
  });

  test('UPUP_WECHAT_CHANNEL=false disables', () => {
    process.env.UPUP_WECHAT_SENDKEY = 'abc';
    process.env.UPUP_WECHAT_CHANNEL = 'false';
    expect(new WechatChannel().isEnabled()).toBe(false);
  });
});

describe('WechatChannel configured', () => {
  beforeEach(() => { clearEnv(); enableGates(); });
  afterEach(() => disableGates());

  test('sct: POSTs form to sctapi.ftqq.com and returns pushid', async () => {
    process.env.UPUP_WECHAT_SENDKEY = 'mykey';
    let capturedUrl = '';
    let capturedMethod = '';
    let capturedBody = '';
    globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? 'GET';
      capturedBody = init?.body == null ? '' : String(init.body);
      return new Response(JSON.stringify({ errno: 0, data: { pushid: 'p-1' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    const r = await new WechatChannel().send(samplePayload);
    expect(r.ok).toBe(true);
    expect(r.channelMessageId).toBe('p-1');
    expect(capturedUrl).toBe('https://sctapi.ftqq.com/mykey.send');
    expect(capturedMethod).toBe('POST');
    expect(capturedBody).toContain('title=Hello');
  });

  test('pushplus: POSTs to pushplus.plus', async () => {
    process.env.UPUP_WECHAT_PROVIDER = 'pushplus';
    process.env.UPUP_WECHAT_SENDKEY = 'ptok';
    let capturedUrl = '';
    globalThis.fetch = mock(async (url: string) => {
      capturedUrl = url;
      return new Response(JSON.stringify({ code: 200, data: 'pp-1' }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await new WechatChannel().send(samplePayload);
    expect(r.ok).toBe(true);
    expect(r.channelMessageId).toBe('pp-1');
    expect(capturedUrl).toBe('https://www.pushplus.plus/send');
  });
});

// ---------------------------------------------------------------------------
// FeishuChannel
// ---------------------------------------------------------------------------

describe('FeishuChannel', () => {
  beforeEach(() => { clearEnv(); enableGates(); });
  afterEach(() => disableGates());

  test('isEnabled false without webhook', () => {
    expect(new FeishuChannel().isEnabled()).toBe(false);
  });

  test('isEnabled true with webhook', () => {
    process.env.UPUP_FEISHU_WEBHOOK = 'https://open.feishu.cn/hook/abc';
    expect(new FeishuChannel().isEnabled()).toBe(true);
  });

  test('UPUP_FEISHU_CHANNEL=false disables', () => {
    process.env.UPUP_FEISHU_WEBHOOK = 'https://x';
    process.env.UPUP_FEISHU_CHANNEL = 'false';
    expect(new FeishuChannel().isEnabled()).toBe(false);
  });

  test('send returns ok:false without throwing when unconfigured', async () => {
    const r = await new FeishuChannel().send(samplePayload);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not configured/);
  });

  test('sends unsigned payload when no secret', async () => {
    process.env.UPUP_FEISHU_WEBHOOK = 'https://open.feishu.cn/hook/abc';
    let captured: { url: string; body: string } = { url: '', body: '' };
    globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
      captured = { url, body: String(init?.body ?? '') };
      return new Response(JSON.stringify({ StatusCode: 0, data: { message_id: 'm-1' } }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await new FeishuChannel().send(samplePayload);
    expect(r.ok).toBe(true);
    expect(r.channelMessageId).toBe('m-1');
    expect(captured.url).toBe('https://open.feishu.cn/hook/abc');
    const body = JSON.parse(captured.body);
    expect(body.msg_type).toBe('interactive');
    expect(body.timestamp).toBeUndefined();
    expect(body.sign).toBeUndefined();
  });

  test('sends signed payload when secret set', async () => {
    process.env.UPUP_FEISHU_WEBHOOK = 'https://open.feishu.cn/hook/abc';
    process.env.UPUP_FEISHU_SECRET = 'sec';
    let capturedBody = '';
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      capturedBody = String(init?.body ?? '');
      return new Response(JSON.stringify({ StatusCode: 0, data: { message_id: 'm-2' } }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await new FeishuChannel().send(samplePayload);
    expect(r.ok).toBe(true);
    const body = JSON.parse(capturedBody);
    expect(body.timestamp).toBeTruthy();
    expect(body.sign).toBeTruthy();
  });

  test('handles non-zero StatusCode from feishu', async () => {
    process.env.UPUP_FEISHU_WEBHOOK = 'https://open.feishu.cn/hook/abc';
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ StatusCode: 1, msg: 'invalid token' }), { status: 200 }),
    ) as unknown as typeof fetch;
    const r = await new FeishuChannel().send(samplePayload);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('invalid token');
  });
});

// ---------------------------------------------------------------------------
// DingtalkChannel
// ---------------------------------------------------------------------------

describe('DingtalkChannel', () => {
  beforeEach(() => { clearEnv(); enableGates(); });
  afterEach(() => disableGates());

  test('isEnabled false without webhook', () => {
    expect(new DingtalkChannel().isEnabled()).toBe(false);
  });

  test('isEnabled true with webhook', () => {
    process.env.UPUP_DINGTALK_WEBHOOK = 'https://oapi.dingtalk.com/robot/send?access_token=x';
    expect(new DingtalkChannel().isEnabled()).toBe(true);
  });

  test('send returns ok:false without throwing when unconfigured', async () => {
    const r = await new DingtalkChannel().send(samplePayload);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not configured/);
  });

  test('sends without sign when no secret', async () => {
    process.env.UPUP_DINGTALK_WEBHOOK = 'https://oapi.dingtalk.com/robot/send?access_token=x';
    let capturedUrl = '';
    globalThis.fetch = mock(async (url: string) => {
      capturedUrl = url;
      return new Response(JSON.stringify({ errcode: 0, errmsg: 'ok' }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await new DingtalkChannel().send(samplePayload);
    expect(r.ok).toBe(true);
    expect(capturedUrl).toBe('https://oapi.dingtalk.com/robot/send?access_token=x');
  });

  test('appends timestamp + sign when secret set', async () => {
    process.env.UPUP_DINGTALK_WEBHOOK = 'https://oapi.dingtalk.com/robot/send?access_token=x';
    process.env.UPUP_DINGTALK_SECRET = 'sec';
    let capturedUrl = '';
    globalThis.fetch = mock(async (url: string) => {
      capturedUrl = url;
      return new Response(JSON.stringify({ errcode: 0 }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await new DingtalkChannel().send(samplePayload);
    expect(r.ok).toBe(true);
    expect(capturedUrl).toMatch(/timestamp=/);
    expect(capturedUrl).toMatch(/sign=/);
  });
});

// ---------------------------------------------------------------------------
// EmailChannel
// ---------------------------------------------------------------------------

describe('EmailChannel', () => {
  beforeEach(() => { clearEnv(); enableGates(); });
  afterEach(() => disableGates());

  test('isEnabled false without config', () => {
    expect(new EmailChannel().isEnabled()).toBe(false);
  });

  test('isEnabled false when missing any one of api_key / from / to', () => {
    process.env.UPUP_EMAIL_API_KEY = 're_xxx';
    process.env.UPUP_EMAIL_FROM = 'a@b.com';
    expect(new EmailChannel().isEnabled()).toBe(false);
    delete process.env.UPUP_EMAIL_TO;
    process.env.UPUP_EMAIL_TO = '';
    expect(new EmailChannel().isEnabled()).toBe(false);
  });

  test('isEnabled true with full config', () => {
    process.env.UPUP_EMAIL_API_KEY = 're_xxx';
    process.env.UPUP_EMAIL_FROM = 'a@b.com';
    process.env.UPUP_EMAIL_TO = 'x@y.com,z@a.com';
    expect(new EmailChannel().isEnabled()).toBe(true);
  });

  test('send returns ok:false without throwing when unconfigured', async () => {
    const r = await new EmailChannel().send(samplePayload);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not configured/);
  });

  test('resend: returns message id on 200 + id', async () => {
    process.env.UPUP_EMAIL_API_KEY = 're_xxx';
    process.env.UPUP_EMAIL_FROM = 'a@b.com';
    process.env.UPUP_EMAIL_TO = 'x@y.com';
    let captured: { url: string; body: string; auth: string | null } = { url: '', body: '', auth: null };
    globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
      captured = {
        url,
        body: String(init?.body ?? ''),
        auth: (init?.headers as Record<string, string> | undefined)?.Authorization ?? null,
      };
      return new Response(JSON.stringify({ id: 'em-1' }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await new EmailChannel().send(samplePayload);
    expect(r.ok).toBe(true);
    expect(r.channelMessageId).toBe('em-1');
    expect(captured.url).toBe('https://api.resend.com/emails');
    expect(captured.auth).toBe('Bearer re_xxx');
    const body = JSON.parse(captured.body);
    expect(body.subject).toBe('Hello');
    expect(body.to).toEqual(['x@y.com']);
  });

  test('sendgrid: returns 202 + x-message-id', async () => {
    process.env.UPUP_EMAIL_PROVIDER = 'sendgrid';
    process.env.UPUP_EMAIL_API_KEY = 'SG.xxx';
    process.env.UPUP_EMAIL_FROM = 'a@b.com';
    process.env.UPUP_EMAIL_TO = 'x@y.com';
    let capturedUrl = '';
    globalThis.fetch = mock(async (url: string) => {
      capturedUrl = url;
      return new Response(null, { status: 202, headers: { 'x-message-id': 'sg-1' } });
    }) as unknown as typeof fetch;
    const r = await new EmailChannel().send(samplePayload);
    expect(r.ok).toBe(true);
    expect(r.channelMessageId).toBe('sg-1');
    expect(capturedUrl).toBe('https://api.sendgrid.com/v3/mail/send');
  });
});

// ---------------------------------------------------------------------------
// ChannelRegistry
// ---------------------------------------------------------------------------

describe('ChannelRegistry', () => {
  beforeEach(() => { clearEnv(); enableGates(); });
  afterEach(() => disableGates());

  function makeOk(name: string): PushChannel {
    return { name, isEnabled: () => true, send: async () => ({ ok: true, latencyMs: 1 }) };
  }
  function makeFail(name: string, msg: string): PushChannel {
    return { name, isEnabled: () => true, send: async () => ({ ok: false, error: msg, latencyMs: 1 }) };
  }
  function makeThrow(name: string, msg: string): PushChannel {
    return { name, isEnabled: () => true, send: async () => { throw new Error(msg); } };
  }
  function makeDisabled(name: string): PushChannel {
    return { name, isEnabled: () => false, send: async () => ({ ok: true, latencyMs: 0 }) };
  }

  test('broadcast with no enabled channels returns empty report', async () => {
    const reg = new ChannelRegistry();
    const r = await reg.broadcast(samplePayload);
    expect(r.anyOk).toBe(false);
    expect(r.enabledCount).toBe(0);
    expect(r.registeredCount).toBe(0);
    expect(Object.keys(r.results)).toHaveLength(0);
  });

  test('broadcast aggregates results across channels', async () => {
    const reg = new ChannelRegistry();
    reg.register(makeOk('a'));
    reg.register(makeFail('b', 'boom'));
    reg.register(makeThrow('c', 'crash'));
    const r = await reg.broadcast(samplePayload);
    expect(r.anyOk).toBe(true);
    expect(r.enabledCount).toBe(3);
    expect(r.registeredCount).toBe(3);
    expect(r.results.a.ok).toBe(true);
    expect(r.results.b.ok).toBe(false);
    expect(r.results.b.error).toBe('boom');
    expect(r.results.c.ok).toBe(false);
    expect(r.results.c.error).toBe('crash');
  });

  test('broadcast skips disabled channels', async () => {
    const reg = new ChannelRegistry();
    reg.register(makeDisabled('off'));
    reg.register(makeOk('on'));
    const r = await reg.broadcast(samplePayload);
    expect(r.enabledCount).toBe(1);
    expect(r.registeredCount).toBe(2);
    expect(r.results.on.ok).toBe(true);
    expect(r.results.off).toBeUndefined();
  });

  test('unregister removes channel', () => {
    const reg = new ChannelRegistry();
    reg.register(makeOk('x'));
    expect(reg.list().length).toBe(1);
    expect(reg.unregister('x')).toBe(true);
    expect(reg.list().length).toBe(0);
    expect(reg.unregister('x')).toBe(false);
  });

  test('register replaces same name (last wins)', () => {
    const reg = new ChannelRegistry();
    const a = makeOk('dup');
    const b = makeFail('dup', 'newer');
    reg.register(a);
    reg.register(b);
    expect(reg.list().length).toBe(1);
    expect(reg.list()[0]).toBe(b);
  });

  test('isCompiledIn reflects constructor override', () => {
    const regOn = new ChannelRegistry({ enabled: true });
    const regOff = new ChannelRegistry({ enabled: false });
    regOn.register(makeOk('a'));
    regOff.register(makeOk('a'));
    expect(regOn.isCompiledIn()).toBe(true);
    expect(regOff.isCompiledIn()).toBe(false);
  });

  test('enabled() filters by isEnabled + isCompiledIn', () => {
    const reg = new ChannelRegistry({ enabled: false });
    reg.register(makeOk('a'));
    reg.register(makeDisabled('b'));
    expect(reg.enabled().length).toBe(0);
  });
});
