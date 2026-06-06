/**
 * 飞书 (Feishu / Lark) 推送渠道 — 自定义机器人 webhook。
 *
 * 配置(env):
 *   - UPUP_FEISHU_WEBHOOK: webhook URL(必填)
 *   - UPUP_FEISHU_SECRET : 签名校验 secret(可选,启用 "加签" 安全设置后必填)
 *
 * 协议:
 *   - 启用加签时,先 GET timestamp + sign(hmac-sha256)
 *   - POST JSON: { timestamp, sign, msg_type: 'interactive', card: { ... } }
 *   - 5s timeout
 */
import { createHmac } from 'node:crypto';
import type { PushChannel, PushPayload, PushResult } from './types.js';
import { isChannelsCompiledIn, readEnv, readEnvBool } from './types.js';

const TIMEOUT_MS = 5000;

export class FeishuChannel implements PushChannel {
  readonly name = 'feishu';

  isEnabled(): boolean {
    if (!isChannelsCompiledIn()) return false;
    if (!readEnvBool('UPUP_FEISHU_CHANNEL', true)) return false;
    return !!readEnv('UPUP_FEISHU_WEBHOOK');
  }

  async send(payload: PushPayload): Promise<PushResult> {
    const t0 = Date.now();
    if (!this.isEnabled()) {
      return { ok: false, error: 'feishu channel not configured (set UPUP_FEISHU_WEBHOOK)', latencyMs: Date.now() - t0 };
    }
    const webhook = readEnv('UPUP_FEISHU_WEBHOOK')!;
    const secret = readEnv('UPUP_FEISHU_SECRET');
    try {
      const body: Record<string, unknown> = this.buildCard(payload);
      if (secret) {
        const ts = String(Math.floor(Date.now() / 1000));
        body.timestamp = ts;
        body.sign = this.sign(secret, ts);
      }
      const resp = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const json = (await resp.json().catch(() => ({}))) as { StatusCode?: number; StatusMessage?: string; msg?: string; data?: { message_id?: string } };
      if ((json.StatusCode === 0 || json.StatusCode === undefined) && resp.ok) {
        return { ok: true, channelMessageId: json.data?.message_id, latencyMs: Date.now() - t0 };
      }
      return { ok: false, error: json.msg ?? json.StatusMessage ?? `HTTP ${resp.status}`, latencyMs: Date.now() - t0 };
    } catch (err) {
      return { ok: false, error: (err as Error).message, latencyMs: Date.now() - t0 };
    }
  }

  /** 飞书 interactive card payload,markdown 元素做正文渲染。 */
  private buildCard(payload: PushPayload): { msg_type: 'interactive'; card: Record<string, unknown> } {
    const elements: Array<Record<string, unknown>> = [
      { tag: 'markdown', content: payload.body },
    ];
    if (payload.url) {
      elements.push({ tag: 'action', actions: [{ tag: 'button', text: { tag: 'plain_text', content: '打开' }, type: 'primary', url: payload.url }] });
    }
    if (payload.tags?.length) {
      elements.push({ tag: 'note', elements: [{ tag: 'plain_text', content: `tags: ${payload.tags.join(', ')}` }] });
    }
    return {
      msg_type: 'interactive',
      card: {
        config: { wide_screen_mode: true },
        header: {
          title: { tag: 'plain_text', content: payload.title },
          template: payload.priority === 2 ? 'red' : payload.priority === 0 ? 'grey' : 'blue',
        },
        elements,
      },
    };
  }

  /** 飞书签名: hmac-sha256(key=secret, data=`${timestamp}\\n${secret`).toString('base64') */
  private sign(secret: string, ts: string): string {
    return createHmac('sha256', secret).update(`${ts}\n${secret}`).digest('base64');
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    if (!this.isEnabled()) return { ok: false, detail: 'not configured' };
    return { ok: true, detail: readEnv('UPUP_FEISHU_SECRET') ? 'signed' : 'unsigned' };
  }
}
