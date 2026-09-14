/**
 * Fund Monitor Daemon
 * Periodically updates estimated net values for followed funds
 * 
 * This daemon runs in the background to:
 * 1. Fetch real-time estimated values from eastmoney
 * 2. Update the followed funds storage
 * 3. Check alert conditions and trigger notifications
 */

import { getFollowedFunds, updateFollowedFund } from '../storage/fund-storage.js';
import { getFundEstimatedValue, type FundBasic } from '@upup/pi-finance-sdk';


export interface FundMonitorConfig {
  /** Update interval in milliseconds (default: 5 minutes) */
  interval: number;
  /** Enable alert checking */
  enableAlerts: boolean;
  /** Market hours only (9:30-15:00) */
  marketHoursOnly: boolean;
}

const DEFAULT_CONFIG: FundMonitorConfig = {
  interval: 5 * 60 * 1000, // 5 minutes
  enableAlerts: true,
  marketHoursOnly: true,
};

// Check if within market hours (北京时间 9:30 - 15:00)
function isMarketHours(): boolean {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const time = hours * 60 + minutes;
  
  // 9:30 = 570, 15:00 = 900
  return time >= 570 && time <= 900;
}

// Check if weekday (排除周末)
function isWeekday(): boolean {
  const day = new Date().getDay();
  return day >= 1 && day <= 5;
}

// Check if market is open
function isMarketOpen(): boolean {
  if (!DEFAULT_CONFIG.marketHoursOnly) return true;
  return isMarketHours() && isWeekday();
}

// Update estimated values for all followed funds
export async function updateFollowedFundValues(): Promise<void> {
  if (isMarketOpen()) {
    const followed = getFollowedFunds();
    
    for (const fund of followed) {
      try {
        const estimate = await getFundEstimatedValue(fund.code);
        
        if (estimate) {
          updateFollowedFund(fund.code, {
            lastEstimatedValue: estimate.estimatedUnit,
            lastEstimatedRate: estimate.estimatedRate,
            lastCheck: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error(`Error updating fund ${fund.code}:`, error);
      }
    }
  }
}

// Start the fund monitor daemon
let monitorInterval: NodeJS.Timeout | null = null;

export function startFundMonitor(config: Partial<FundMonitorConfig> = {}): void {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  if (monitorInterval) {
    console.log('Fund monitor already running');
    return;
  }
  
  console.log(`Starting fund monitor (interval: ${finalConfig.interval / 1000}s)`);
  
  // Initial update
  updateFollowedFundValues().catch(console.error);
  
  // Set up periodic updates
  monitorInterval = setInterval(() => {
    updateFollowedFundValues().catch(console.error);
  }, finalConfig.interval);
}

// Stop the fund monitor daemon
export function stopFundMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log('Fund monitor stopped');
  }
}

// Get monitor status
export function getMonitorStatus(): { running: boolean; lastUpdate?: string } {
  return {
    running: monitorInterval !== null,
    lastUpdate: new Date().toISOString(),
  };
}

// Manual trigger for update (useful for testing)
export async function triggerUpdate(): Promise<void> {
  await updateFollowedFundValues();
}

// Export for CLI usage
export { isMarketOpen, isMarketHours };
