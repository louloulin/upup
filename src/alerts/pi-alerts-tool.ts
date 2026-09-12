import { Type, type Static } from '@sinclair/typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { createAlertSystem } from '../tools/alerts/index.js';
import type { PiUpupExtensionApi } from '../pi-main.js';

export const alertSystemParams = Type.Object({
  action: Type.Union([Type.Literal('create'), Type.Literal('list'), Type.Literal('delete'), Type.Literal('check'), Type.Literal('history')]),
  code: Type.Optional(Type.String({ minLength: 1 })),
  alert_type: Type.Optional(Type.Union([Type.Literal('price'), Type.Literal('pct_change'), Type.Literal('volume'), Type.Literal('news'), Type.Literal('portfolio')])),
  threshold: Type.Optional(Type.Number()),
  condition: Type.Optional(Type.Union([Type.Literal('above'), Type.Literal('below'), Type.Literal('change')])),
  alert_id: Type.Optional(Type.String({ minLength: 1 })),
});
export type AlertSystemParams = Static<typeof alertSystemParams>;

interface AlertDetails { success?: boolean; error?: string; [key: string]: unknown }
type Result = { content: Array<{ type: 'text'; text: string }>; details: AlertDetails };

export function createAlertSystemTool() {
  const legacy = createAlertSystem('pi');
  return defineTool({
    name: 'alert_system', label: 'Alert System',
    description: 'Create, list, delete, check, and inspect stock price alerts.',
    promptSnippet: 'Manage investment price and market alerts',
    promptGuidelines: [
      'Use create only after the alert code, type, threshold, and condition are clear.',
      'Use list or history to inspect existing alerts; use check to evaluate current market conditions.',
    ],
    parameters: alertSystemParams, executionMode: 'sequential',
    async execute(_id, params: AlertSystemParams, signal): Promise<Result> {
      if (signal?.aborted) throw new Error('Alert system aborted by caller');
      const text = await legacy.invoke(params);
      let details: AlertDetails;
      try { details = JSON.parse(String(text)) as AlertDetails; }
      catch { details = { success: false, error: String(text) }; }
      if (details.success === false) throw new Error(details.error ?? 'Alert operation failed');
      return { content: [{ type: 'text', text: String(text) }], details };
    },
  });
}

export function registerAlertsExtension(pi: PiUpupExtensionApi): void {
  pi.registerTool(createAlertSystemTool());
}
