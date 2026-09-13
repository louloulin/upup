import { describe, expect, test } from 'bun:test';
import { addSubscription, assertSafeWebhookUrl, createNotificationStore, listNotifications, maskWebhookUrl, sendNotification } from './src/index.js';

describe('pi-notify core', () => {
  test('logs notifications and masks webhook credentials', async () => { const store = createNotificationStore(); const sent = await sendNotification(store, { channel: 'log', title: '完成', message: '已完成' }); expect(sent.status).toBe('sent'); expect(listNotifications(store)).toHaveLength(1); expect(maskWebhookUrl('https://hooks.example.com/secret-token')).toBe('https://hooks.example.com/secret-…'); });
  test('rejects local webhook targets and stores session subscriptions', async () => { await expect(assertSafeWebhookUrl('http://127.0.0.1:18081')).rejects.toThrow('private or local'); const store = createNotificationStore(); const sub = addSubscription(store, { repo: 'upup/demo', prNumber: 1, webhookUrl: 'https://hooks.example.com/token', events: ['merge'] }); expect(sub.active).toBe(true); });
});
