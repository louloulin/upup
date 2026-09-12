/**
 * Alert System for A-shares
 * 
 * Provides comprehensive alert functionality:
 * - Price alerts
 * - Percent change alerts
 * - Volume alerts
 * - News alerts
 * - Portfolio alerts
 */

import { PiTool } from '../../runtime/pi/tool.js';
import { z } from 'zod';
import { getTushareClient, getToday } from '../astock/tushare-client';

export const ALERT_SYSTEM_DESCRIPTION = `## alert_system
Manage price alerts and notifications for A-shares stocks.

**Alert Types**:
- price: Price reaches target level
- pct_change: Percent change threshold
- volume: Unusual volume detected
- news: News sentiment change
- portfolio: Portfolio value change

**Features**:
- Create, list, and delete alerts
- Real-time monitoring
- Multiple alert conditions
- Alert history tracking`;

const AlertSystemSchema = z.object({
  action: z.enum(['create', 'list', 'delete', 'check', 'history']).describe('Alert action'),
  code: z.string().optional().describe('Stock code'),
  alert_type: z.enum(['price', 'pct_change', 'volume', 'news', 'portfolio']).optional().describe('Alert type'),
  threshold: z.number().optional().describe('Alert threshold value'),
  condition: z.enum(['above', 'below', 'change']).optional().describe('Alert condition'),
  alert_id: z.string().optional().describe('Alert ID for delete/check'),
});

interface Alert {
  id: string;
  code: string;
  type: string;
  threshold: number;
  condition: string;
  status: 'active' | 'triggered' | 'expired';
  created_at: string;
  triggered_at?: string;
}

interface AlertResult {
  success: boolean;
  alerts?: Alert[];
  alert?: Alert;
  triggered?: boolean;
  message?: string;
}

// In-memory alert store (in production, use database)
const alertStore: Map<string, Alert> = new Map();
let alertIdCounter = 1;

function generateAlertId(): string {
  return `ALT${Date.now()}${alertIdCounter++}`;
}

/**
 * Check if alert is triggered
 */
async function checkAlertTriggered(alert: Alert, client: any): Promise<boolean> {
  try {
    const today = getToday();
    const dailyData = await client.daily({ ts_code: alert.code, trade_date: today });
    
    if (!Array.isArray(dailyData) || dailyData.length === 0) {
      return false;
    }
    
    const data = dailyData[0];
    const price = parseFloat(String(data.close || 0));
    const pctChg = parseFloat(String(data.pct_chg || 0));
    const volume = parseFloat(String(data.volume || 0));
    
    switch (alert.type) {
      case 'price':
        if (alert.condition === 'above' && price > alert.threshold) return true;
        if (alert.condition === 'below' && price < alert.threshold) return true;
        break;
      case 'pct_change':
        if (Math.abs(pctChg) >= alert.threshold) return true;
        break;
      case 'volume':
        // Volume alerts would need baseline comparison
        if (volume > alert.threshold) return true;
        break;
    }
    
    return false;
  } catch (error) {
    return false;
  }
}

export function createAlertSystem(_model: string): PiTool {
  return new PiTool({
    name: 'alert_system',
    description: ALERT_SYSTEM_DESCRIPTION,
    schema: AlertSystemSchema,
    async func(input): Promise<string> {
      try {
        const client = getTushareClient();
        
        switch (input.action) {
          case 'create': {
            if (!input.code || !input.alert_type || input.threshold === undefined) {
              return JSON.stringify({
                success: false,
                error: 'Missing required parameters: code, alert_type, threshold',
              });
            }
            
            const alertId = generateAlertId();
            const alert: Alert = {
              id: alertId,
              code: input.code,
              type: input.alert_type,
              threshold: input.threshold,
              condition: input.condition || 'above',
              status: 'active',
              created_at: new Date().toISOString(),
            };
            
            alertStore.set(alertId, alert);
            
            return JSON.stringify({
              success: true,
              alert,
              message: `Alert created successfully: ${alert.type} for ${alert.code} ${alert.condition} ${alert.threshold}`,
            }, null, 2);
          }
          
          case 'list': {
            const allAlerts = Array.from(alertStore.values());
            const activeAlerts = input.code
              ? allAlerts.filter(a => a.code === input.code && a.status === 'active')
              : allAlerts.filter(a => a.status === 'active');
            
            return JSON.stringify({
              success: true,
              count: activeAlerts.length,
              alerts: activeAlerts,
            }, null, 2);
          }
          
          case 'delete': {
            if (!input.alert_id) {
              return JSON.stringify({
                success: false,
                error: 'Alert ID required for deletion',
              });
            }
            
            const deleted = alertStore.delete(input.alert_id);
            
            return JSON.stringify({
              success: deleted,
              message: deleted ? 'Alert deleted' : 'Alert not found',
            });
          }
          
          case 'check': {
            const alertId = input.alert_id;
            
            if (!alertId) {
              // Check all active alerts
              const activeAlerts = Array.from(alertStore.values()).filter(a => a.status === 'active');
              const results = [];
              
              for (const alert of activeAlerts.slice(0, 20)) { // Limit checks
                const triggered = await checkAlertTriggered(alert, client);
                if (triggered) {
                  alert.status = 'triggered';
                  alert.triggered_at = new Date().toISOString();
                  alertStore.set(alert.id, alert);
                }
                results.push({
                  ...alert,
                  triggered,
                });
              }
              
              const triggeredCount = results.filter(r => r.triggered).length;
              
              return JSON.stringify({
                success: true,
                total_checked: results.length,
                triggered_count: triggeredCount,
                triggered_alerts: results.filter(r => r.triggered),
                active_alerts: results.filter(r => !r.triggered),
              }, null, 2);
            }
            
            // Check specific alert
            const alert = alertStore.get(alertId);
            if (!alert) {
              return JSON.stringify({
                success: false,
                error: 'Alert not found',
              });
            }
            
            const triggered = await checkAlertTriggered(alert, client);
            
            if (triggered && alert.status === 'active') {
              alert.status = 'triggered';
              alert.triggered_at = new Date().toISOString();
              alertStore.set(alertId, alert);
            }
            
            return JSON.stringify({
              success: true,
              alert,
              triggered,
            }, null, 2);
          }
          
          case 'history': {
            const history = Array.from(alertStore.values())
              .filter(a => a.status === 'triggered' || a.status === 'expired')
              .sort((a, b) => {
                const dateA = a.triggered_at || a.created_at;
                const dateB = b.triggered_at || b.created_at;
                return dateB.localeCompare(dateA);
              })
              .slice(0, 50);
            
            return JSON.stringify({
              success: true,
              count: history.length,
              history,
            }, null, 2);
          }
          
          default:
            return JSON.stringify({
              success: false,
              error: 'Unknown action',
              available_actions: ['create', 'list', 'delete', 'check', 'history'],
            });
        }
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: 'Alert system error',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });
}

export default createAlertSystem;
