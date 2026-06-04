/**
 * 微信推送渠道 — Server 酱 / PushPlus(http(s) POST)。
 *
 * 配置(env):
 *   - UPUP_WECHAT_PROVIDER: 'sct' | 'pushplus' | 'corp'(企业微信,默认 'sct')
 *   - UPUP_WECHAT_SENDKEY  : Server 酱 SendKey(sct) / PushPlus token(pushplus)
 *   - UPUP_WECHAT_CORP_ID  + UPUP_WECHAT_CORP_SECRET + UPUP_WECHAT_AGENT_ID + UPUP_WECHAT_TO_USER
 *                            (企业微信,corpid/corpsecret/agentid/@userid)
 *
 * 行为:
 *   - send() 走 fetch(内置),失败返回 { ok: false, error }
 *   - timeout 5s(避免阻塞 KAIROS cron)
 */
import type { PushChannel, PushPayload, PushResult } from './types.js';
import { isChannelsCompiledIn, readEnv, readEnvBool } from './types.js';

type WechatProvider = 'sct' | 'pushplus' | 'corp';

const TIMEOUT_MS = 5000;

export class WechatChannel implements PushChannel {
  readonly name = 'wechat';

  isEnabled(): boolean {
    if (!isChannelsCompiledIn()) return false;
    if (!readEnvBool('UPUP_WECHAT_CHANNEL', true)) return false;
    const provider = (readEnv('UPUP_WECHAT_PROVIDER') ?? 'sct') as WechatProvider;
    if (provider === 'corp') {
      return !!(readEnv('UPUP_WECHAT_CORP_ID') && readEnv('UPUP_WECHAT_CORP_SECRET')
        && readEnv('UPUP_WECHAT_AGENT_ID') && readEnv('UPUP_WECHAT_TO_USER'));
    }
    return !!readEnv('UPUP_WECHAT_SENDKEY');
  }

  async send(payload: PushPayload): Promise<PushResult> {
    const t0 = Date.now();
    if (!this.isEnabled()) {
      return { ok: false, error: 'wechat channel not configured (set UPUP_WECHAT_SENDKEY or corp env)', latencyMs: Date.now() - t0 };
    }
    const provider = (readEnv('UPUP_WECHAT_PROVIDER') ?? 'sct') as WechatProvider;
    try {
      if (provider === 'pushplus') {
        return await this.sendPushPlus(payload, t0);
      }
      if (provider === 'corp') {
        return await this.sendCorp(payload, t0);
      }
      return await this.sendSct(payload, t0);
    } catch (err) {
      return { ok: false, error: (err as Error).message, latencyMs: Date.now() - t0 };
    }
  }

  private async sendSct(payload: PushPayload, t0: number): Promise<PushResult> {
    const sendkey = readEnv('UPUP_WECHAT_SENDKEY')!;
    const url = `https://sctapi.ftqq.com/${encodeURIComponent(sendkey)}.send`;
    const form = new URLSearchParams();
    form.set('title', payload.title);
    form.set('desp', payload.body + (payload.url ? `\n\n[打开](${payload.url})` : ''));
    const resp = await fetch(url, { method: 'POST', body: form, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const json = (await resp.json().catch(() => ({}))) as { errno?: number; errmsg?: string; data?: { pushid?: string } };
    if (resp.ok && (json.errno === 0 || json.errno === undefined)) {
      return { ok: true, channelMessageId: json.data?.pushid, latencyMs: Date.now() - t0 };
    }
    return { ok: false, error: json.errmsg ?? `HTTP ${resp.status}`, latencyMs: Date.now() - t0 };
  }

  private async sendPushPlus(payload: PushPayload, t0: number): Promise<PushResult> {
    const token = readEnv('UPUP_WECHAT_SENDKEY')!;
    const form = new URLSearchParams();
    form.set('token', token);
    form.set('title', payload.title);
    form.set('content', payload.body + (payload.url ? `\n\n[打开](${payload.url})` : ''));
    const resp = await fetch('https://www.pushplus.plus/send', { method: 'POST', body: form, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const json = (await resp.json().catch(() => ({}))) as { code?: number; msg?: string; data?: string };
    if (resp.ok && (json.code === 200 || json.code === undefined)) {
      return { ok: true, channelMessageId: json.data, latencyMs: Date.now() - t0 };
    }
    return { ok: false, error: json.msg ?? `HTTP ${resp.status}`, latencyMs: Date.now() - t0 };
  }

  private async sendCorp(payload: PushPayload, t0: number): Promise<PushResult> {
    // 企业微信: 先取 access_token,再 push text
    const corpId = readEnv('UPUP_WECHAT_CORP_ID')!;
    const corpSecret = readEnv('UPUP_WECHAT_CORP_SECRET')!;
    const agentId = readEnv('UPUP_WECHAT_AGENT_ID')!;
    const toUser = readEnv('UPUP_WECHAT_TO_USER')!;
    const tokResp = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(corpSecret)}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    const tok = (await tokResp.json().catch(() => ({}))) as { access_token?: string; errmsg?: string };
    if (!tok.access_token) {
      return { ok: false, error: `gettoken: ${tok.errmsg ?? 'no access_token'}`, latencyMs: Date.now() - t0 };
    }
    const body = {
      touser: toUser,
      msgtype: 'text',
      agentid: Number(agentId),
      text: { content: `${payload.title}\n\n${payload.body}${payload.url ? `\n${payload.url}` : ''}` },
    };
    const msgResp = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(tok.access_token)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    const json = (await msgResp.json().catch(() => ({}))) as { errcode?: number; errmsg?: string; msgid?: string };
    if (json.errcode === 0) {
      return { ok: true, channelMessageId: json.msgid, latencyMs: Date.now() - t0 };
    }
    return { ok: false, error: json.errmsg ?? `errcode ${json.errcode}`, latencyMs: Date.now() - t0 };
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    if (!this.isEnabled()) return { ok: false, detail: 'not configured' };
    return { ok: true, detail: `provider=${readEnv('UPUP_WECHAT_PROVIDER') ?? 'sct'}` };
  }
}
