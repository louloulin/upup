import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { randomUUID } from 'node:crypto';

export const PI_NOTIFY_PACKAGE_NAME = '@upup/pi-notify' as const;
export const PI_NOTIFY_PACKAGE_VERSION = '0.1.0' as const;
export type NotificationLevel = 'info' | 'warning' | 'error' | 'critical';
export type NotificationChannel = 'webhook' | 'feishu' | 'log';
export type PREvent = 'comment' | 'review' | 'merge' | 'close' | 'reopen' | 'label' | 'assign' | 'ready_for_review';

export interface Notification { readonly id: string; readonly channel: NotificationChannel; readonly title: string; readonly message: string; readonly level: NotificationLevel; readonly timestamp: number; readonly status: 'sent' | 'failed' | 'pending'; readonly error?: string }
export interface PRSubscription { readonly id: string; readonly repo: string; readonly prNumber: number; readonly webhookUrl: string; readonly events: readonly PREvent[]; readonly createdAt: number; readonly active: boolean }
export interface NotificationStore { readonly notifications: Notification[]; readonly subscriptions: Map<string, PRSubscription> }

export function createNotificationStore(): NotificationStore { return { notifications: [], subscriptions: new Map() }; }
export function maskWebhookUrl(value: string): string { try { const url = new URL(value); return `${url.protocol}//${url.hostname}${url.pathname.length > 1 ? `${url.pathname.slice(0, 8)}…` : ''}`; } catch { return '[invalid-url]'; } }

function parseIpv4(value: string): number[] | undefined { const parts = value.split('.'); if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return undefined; return parts.map(Number); }
function privateIpv4(value: string): boolean { const parts = parseIpv4(value); if (!parts) return false; const [first, second] = parts; return first === 0 || first === 10 || first === 127 || (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) || (first === 192 && (second === 0 || second === 168)) || first >= 224; }
export async function assertSafeWebhookUrl(value: string): Promise<URL> {
  let url: URL; try { url = new URL(value); } catch { throw new Error('webhook URL must be valid HTTP(S)'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('webhook URL must use HTTP or HTTPS');
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal') || isIP(hostname) === 4 && privateIpv4(hostname)) throw new Error(`webhook refused private or local target: ${url.hostname}`);
  if (isIP(hostname) === 0) {
    let addresses: Array<{ address: string }>; try { addresses = await lookup(hostname, { all: true, verbatim: true }); } catch (error) { throw new Error(`webhook host resolution failed: ${error instanceof Error ? error.message : String(error)}`); }
    if (addresses.length === 0 || addresses.some(({ address }) => isIP(address) === 4 && privateIpv4(address))) throw new Error(`webhook refused private or local target: ${hostname}`);
  }
  return url;
}

export function appendNotification(store: NotificationStore, notification: Notification): void { store.notifications.push(notification); if (store.notifications.length > 100) store.notifications.splice(0, store.notifications.length - 100); }
export function listNotifications(store: NotificationStore, filter?: { channel?: NotificationChannel; level?: NotificationLevel; limit?: number }): readonly Notification[] { return store.notifications.filter((item) => (!filter?.channel || item.channel === filter.channel) && (!filter?.level || item.level === filter.level)).slice(-(filter?.limit ?? 20)).reverse(); }
export function addSubscription(store: NotificationStore, input: { repo: string; prNumber: number; webhookUrl: string; events: readonly PREvent[] }): PRSubscription { const subscription = { id: `pr-sub-${randomUUID()}`, ...input, events: [...input.events], createdAt: Date.now(), active: true } satisfies PRSubscription; store.subscriptions.set(subscription.id, subscription); return subscription; }
export function removeSubscription(store: NotificationStore, id: string): boolean { return store.subscriptions.delete(id); }
export function listSubscriptions(store: NotificationStore, repo?: string, activeOnly = true): readonly PRSubscription[] { return [...store.subscriptions.values()].filter((item) => (!repo || item.repo === repo) && (!activeOnly || item.active)); }

export async function sendNotification(store: NotificationStore, input: { channel: NotificationChannel; url?: string; title: string; message: string; level?: NotificationLevel }): Promise<Notification> {
  const notification: Notification = { id: `notif-${randomUUID()}`, channel: input.channel, title: input.title, message: input.message, level: input.level ?? 'info', timestamp: Date.now(), status: 'pending' };
  try {
    if (input.channel === 'log') { const sent = { ...notification, status: 'sent' as const }; appendNotification(store, sent); return sent; }
    if (!input.url) throw new Error('url is required for webhook and feishu channels');
    const url = await assertSafeWebhookUrl(input.url);
    const payload = input.channel === 'feishu' ? { msg_type: 'text', content: { text: `${input.title}\n${input.message}` } } : { title: input.title, message: input.message, level: input.level ?? 'info' };
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const sent = { ...notification, status: 'sent' as const }; appendNotification(store, sent); return sent;
  } catch (error) { const failed = { ...notification, status: 'failed' as const, error: error instanceof Error ? error.message : String(error) }; appendNotification(store, failed); return failed; }
}
