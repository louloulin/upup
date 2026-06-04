/**
 * 钉钉 (DingTalk) 推送渠道 — 自定义机器人 webhook。
 *
 * 配置(env):
 *   - UPUP_DINGTALK_WEBHOOK: webhook URL(必填)
 *   - UPUP_DINGTALK_SECRET : 加签 secret(可选)
 *
 * 协议:
 *   - 启用加签时,URL 追加 &timestamp=...&sign=... (sign = base64(hmac-sha256(secret, `${ts}\\n`))
 *     GET 顺序: GET https://oapi.dingtalk.com/robot/getsign?suite_key=... 或旧版 GET /robot/encrypt
 *   - POST JSON: { msgtype: 'markdown', markdown: { title, text } }
 *   - 5s timeout
 */
import { createHmac } from 'node:crypto';
import type { PushChannel, PushPayload, PushResult } from './types.js';
import { isChannelsCompiledIn, readEnv, readEnvBool } from './types.js';

const TIMEOUT_MS = 5000;

export class DingtalkChannel implements PushChannel {
  readonly name = 'dingtalk';

  isEnabled(): boolean {
    if (!isChannelsCompiledIn()) return false;
    if (!readEnvBool('UPUP_DINGTALK_CHANNEL', true)) return false;
    return !!readEnv('UPUP_DINGTALK_WEBHOOK');
  }

  async send(payload: PushPayload): Promise<PushResult> {
    const t0 = Date.now();
    if (!this.isEnabled()) {
      return { ok: false, error: 'dingtalk channel not configured (set UPUP_DINGTALK_WEBHOOK)', latencyMs: Date.now() - t0 };
    }
    const baseWebhook = readEnv('UPUP_DINGTALK_WEBHOOK')!;
    const secret = readEnv('UPUP_DINGTALK_SECRET');
    try {
      let url = baseWebhook;
      if (secret) {
        const ts = String(Date.now());
        const sign = this.sign(secret, ts);
        url += (baseWebhook.includes('?') ? '&' : '?') + `timestamp=${encodeURIComponent(ts)}&sign=${encodeURIComponent(sign)}`;
      }
      const atMobiles: string[] = [];
      if (payload.priority === 2) atMobiles.push('@all');
      const body = {
        msgtype: 'markdown',
        markdown: {
          title: payload.title,
          text: [`# ${payload.title}`, '', payload.body, payload.url ? `\n\n[打开](${payload.url})` : ''].join('\n'),
        },
        at: { atMobiles, isAtAll: payload.priority === 2 },
      };
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const json = (await resp.json().catch(() => ({}))) as { errcode?: number; errmsg?: string };
      if (resp.ok && (json.errcode === 0 || json.errcode === undefined)) {
        return { ok: true, latencyMs: Date.now() - t0 };
      }
      return { ok: false, error: json.errmsg ?? `errcode ${json.errcode}`, latencyMs: Date.now() - t0 };
    } catch (err) {
      return { ok: false, error: (err as Error).message, latencyMs: Date.now() - t0 };
    }
  }

  /** 钉钉加签:urlencode(base64(hmac-sha256(secret, `${ts}\\n`))) */
  private sign(secret: string, ts: string): string {
    const hmac = createHmac('sha256', secret).update(`${ts}\n`).digest();
    return Buffer.from(hmac).toString('base64');
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    if (!this.isEnabled()) return { ok: false, detail: 'not configured' };
    return { ok: true, detail: readEnv('UPUP_DINGTALK_SECRET') ? 'signed' : 'unsigned' };
  }
}
