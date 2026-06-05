/**
 * 邮件推送渠道 — Resend / SendGrid HTTP API(零依赖,Node fetch 即可)。
 *
 * 配置(env,二选一):
 *   - Provider 'resend' (默认):
 *       UPUP_EMAIL_PROVIDER = 'resend'
 *       UPUP_EMAIL_API_KEY  = re_xxx
 *       UPUP_EMAIL_FROM     = 'UpUp <noreply@yourdomain.com>'
 *       UPUP_EMAIL_TO       = 'a@x.com,b@y.com'  (逗号分隔)
 *   - Provider 'sendgrid':
 *       UPUP_EMAIL_PROVIDER = 'sendgrid'
 *       UPUP_EMAIL_API_KEY  = SG.xxx
 *       UPUP_EMAIL_FROM     = 'noreply@yourdomain.com'
 *       UPUP_EMAIL_TO       = 'a@x.com,b@y.com'
 *
 * 5s timeout,失败软返回。
 */
import type { PushChannel, PushPayload, PushResult } from './types.js';
import { isChannelsCompiledIn, readEnv, readEnvBool } from './types.js';

type EmailProvider = 'resend' | 'sendgrid';
const TIMEOUT_MS = 5000;

function parseToList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
}

export class EmailChannel implements PushChannel {
  readonly name = 'email';

  isEnabled(): boolean {
    if (!isChannelsCompiledIn()) return false;
    if (!readEnvBool('UPUP_EMAIL_CHANNEL', true)) return false;
    return !!(
      readEnv('UPUP_EMAIL_API_KEY')
      && readEnv('UPUP_EMAIL_FROM')
      && parseToList(readEnv('UPUP_EMAIL_TO')).length > 0
    );
  }

  async send(payload: PushPayload): Promise<PushResult> {
    const t0 = Date.now();
    if (!this.isEnabled()) {
      return { ok: false, error: 'email channel not configured (set UPUP_EMAIL_API_KEY + UPUP_EMAIL_FROM + UPUP_EMAIL_TO)', latencyMs: Date.now() - t0 };
    }
    const provider = (readEnv('UPUP_EMAIL_PROVIDER') ?? 'resend') as EmailProvider;
    const apiKey = readEnv('UPUP_EMAIL_API_KEY')!;
    const from = readEnv('UPUP_EMAIL_FROM')!;
    const to = parseToList(readEnv('UPUP_EMAIL_TO'));
    const textBody = `${payload.title}\n\n${payload.body}${payload.url ? `\n\n${payload.url}` : ''}`;
    try {
      if (provider === 'sendgrid') {
        return await this.sendSendGrid(apiKey, from, to, payload, textBody, t0);
      }
      return await this.sendResend(apiKey, from, to, payload, textBody, t0);
    } catch (err) {
      return { ok: false, error: (err as Error).message, latencyMs: Date.now() - t0 };
    }
  }

  private async sendResend(apiKey: string, from: string, to: string[], payload: PushPayload, text: string, t0: number): Promise<PushResult> {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        subject: payload.title,
        text,
        html: `<h3>${this.escapeHtml(payload.title)}</h3><pre style="font-family:inherit;white-space:pre-wrap">${this.escapeHtml(payload.body)}</pre>${payload.url ? `<p><a href="${this.escapeHtml(payload.url)}">${this.escapeHtml(payload.url)}</a></p>` : ''}`,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = (await resp.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (resp.ok && json.id) {
      return { ok: true, channelMessageId: json.id, latencyMs: Date.now() - t0 };
    }
    return { ok: false, error: json.message ?? json.name ?? `HTTP ${resp.status}`, latencyMs: Date.now() - t0 };
  }

  private async sendSendGrid(apiKey: string, from: string, to: string[], payload: PushPayload, text: string, t0: number): Promise<PushResult> {
    const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: to.map((email) => ({ email })) }],
        from: { email: from },
        subject: payload.title,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: `<h3>${this.escapeHtml(payload.title)}</h3><pre style="font-family:inherit;white-space:pre-wrap">${this.escapeHtml(payload.body)}</pre>${payload.url ? `<p><a href="${this.escapeHtml(payload.url)}">${this.escapeHtml(payload.url)}</a></p>` : ''}` },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // SendGrid 返回 202 + X-Message-Id 头
    if (resp.status === 202) {
      return { ok: true, channelMessageId: resp.headers.get('x-message-id') ?? undefined, latencyMs: Date.now() - t0 };
    }
    const json = (await resp.json().catch(() => ({}))) as { errors?: Array<{ message: string }> };
    const err = json.errors?.[0]?.message ?? `HTTP ${resp.status}`;
    return { ok: false, error: err, latencyMs: Date.now() - t0 };
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    if (!this.isEnabled()) return { ok: false, detail: 'not configured' };
    const provider = readEnv('UPUP_EMAIL_PROVIDER') ?? 'resend';
    const count = parseToList(readEnv('UPUP_EMAIL_TO')).length;
    return { ok: true, detail: `provider=${provider} to=${count}` };
  }
}
