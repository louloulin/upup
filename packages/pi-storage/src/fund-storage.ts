/**
 * Fund Storage - Local storage for followed funds
 * Stores fund follow/unfollow data in local JSON file
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { upupPath } from '../utils/paths.js';

// Get the directory of this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Storage file path
const FUND_DATA_DIR = upupPath('data');
const FUND_FOLLOW_FILE = join(FUND_DATA_DIR, 'followed-funds.json');

export interface FollowedFund {
  code: string;
  name: string;
  addedAt: string;
  lastCheck: string;
  lastNetValue?: number;
  lastEstimatedValue?: number;
  lastEstimatedRate?: number;
  type?: string;
  company?: string;
  manager?: string;
}

export interface FundStorage {
  followed: FollowedFund[];
  alerts: FundAlert[];
}

export interface FundAlert {
  id: string;
  fundCode: string;
  fundName: string;
  type: 'price_above' | 'price_below' | 'change_up' | 'change_down' | 'estimate_update';
  condition: {
    value: number;
  };
  enabled: boolean;
  createdAt: string;
  lastTriggered?: string;
  triggerCount: number;
}

// Ensure data directory exists
function ensureDataDir(): void {
  if (!existsSync(FUND_DATA_DIR)) {
    mkdirSync(FUND_DATA_DIR, { recursive: true });
  }
}

// Load storage from file
function loadStorage(): FundStorage {
  ensureDataDir();
  
  if (!existsSync(FUND_FOLLOW_FILE)) {
    return { followed: [], alerts: [] };
  }
  
  try {
    const data = readFileSync(FUND_FOLLOW_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { followed: [], alerts: [] };
  }
}

// Save storage to file
function saveStorage(storage: FundStorage): void {
  ensureDataDir();
  writeFileSync(FUND_FOLLOW_FILE, JSON.stringify(storage, null, 2), 'utf-8');
}

// Follow a fund
export function followFund(fund: FollowedFund): boolean {
  const storage = loadStorage();
  
  // Check if already followed
  const existing = storage.followed.find(f => f.code === fund.code);
  if (existing) {
    return false; // Already followed
  }
  
  // Add to followed list
  storage.followed.push({
    ...fund,
    addedAt: fund.addedAt || new Date().toISOString(),
    lastCheck: fund.lastCheck || new Date().toISOString(),
  });
  
  saveStorage(storage);
  return true;
}

// Unfollow a fund
export function unfollowFund(fundCode: string): boolean {
  const storage = loadStorage();
  
  const index = storage.followed.findIndex(f => f.code === fundCode);
  if (index === -1) {
    return false; // Not found
  }
  
  storage.followed.splice(index, 1);
  saveStorage(storage);
  return true;
}

// Get all followed funds
export function getFollowedFunds(): FollowedFund[] {
  const storage = loadStorage();
  return storage.followed;
}

// Get a single followed fund
export function getFollowedFund(fundCode: string): FollowedFund | null {
  const storage = loadStorage();
  return storage.followed.find(f => f.code === fundCode) || null;
}

// Update followed fund info
export function updateFollowedFund(fundCode: string, updates: Partial<FollowedFund>): boolean {
  const storage = loadStorage();
  
  const fund = storage.followed.find(f => f.code === fundCode);
  if (!fund) {
    return false;
  }
  
  Object.assign(fund, updates, { lastCheck: new Date().toISOString() });
  saveStorage(storage);
  return true;
}

// Create fund alert
export function createFundAlert(alert: Omit<FundAlert, 'id' | 'createdAt' | 'triggerCount'>): FundAlert | null {
  const storage = loadStorage();
  
  // Check if fund is followed
  const fund = storage.followed.find(f => f.code === alert.fundCode);
  if (!fund) {
    return null; // Fund must be followed
  }
  
  const newAlert: FundAlert = {
    ...alert,
    id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date().toISOString(),
    triggerCount: 0,
  };
  
  storage.alerts.push(newAlert);
  saveStorage(storage);
  return newAlert;
}

// Get fund alerts
export function getFundAlerts(fundCode?: string): FundAlert[] {
  const storage = loadStorage();
  
  if (fundCode) {
    return storage.alerts.filter(a => a.fundCode === fundCode);
  }
  
  return storage.alerts;
}

// Delete fund alert
export function deleteFundAlert(alertId: string): boolean {
  const storage = loadStorage();
  
  const index = storage.alerts.findIndex(a => a.id === alertId);
  if (index === -1) {
    return false;
  }
  
  storage.alerts.splice(index, 1);
  saveStorage(storage);
  return true;
}

// Update alert trigger
export function updateAlertTrigger(alertId: string): boolean {
  const storage = loadStorage();
  
  const alert = storage.alerts.find(a => a.id === alertId);
  if (!alert) {
    return false;
  }
  
  alert.lastTriggered = new Date().toISOString();
  alert.triggerCount++;
  saveStorage(storage);
  return true;
}

// Check if fund is followed
export function isFundFollowed(fundCode: string): boolean {
  const storage = loadStorage();
  return storage.followed.some(f => f.code === fundCode);
}

// Get followed fund count
export function getFollowedCount(): number {
  const storage = loadStorage();
  return storage.followed.length;
}

// Clear all followed funds
export function clearAllFollowed(): void {
  saveStorage({ followed: [], alerts: [] });
}

// ============================================================================
// Fund Monitor Integration - Check alerts on value updates
// ============================================================================

import { getFundEstimatedValue } from '@upup/pi-finance-sdk';

/**
 * Check all alerts for a fund and return triggered ones
 */
export function checkFundAlerts(fundCode: string, currentValue: number, changeRate: number): FundAlert[] {
  const alerts = getFundAlerts(fundCode);
  const triggered: FundAlert[] = [];
  
  for (const alert of alerts) {
    if (!alert.enabled) continue;
    
    let shouldTrigger = false;
    
    switch (alert.type) {
      case 'price_above':
        shouldTrigger = currentValue > alert.condition.value;
        break;
      case 'price_below':
        shouldTrigger = currentValue < alert.condition.value;
        break;
      case 'change_up':
        shouldTrigger = changeRate > alert.condition.value;
        break;
      case 'change_down':
        shouldTrigger = changeRate < -alert.condition.value;
        break;
    }
    
    if (shouldTrigger) {
      triggered.push(alert);
    }
  }
  
  return triggered;
}

/**
 * Update fund and check alerts
 */
export async function updateFundWithAlertCheck(fundCode: string): Promise<{
  updated: boolean;
  triggeredAlerts: FundAlert[];
}> {
  try {
    const estimate = await getFundEstimatedValue(fundCode);
    
    if (!estimate) {
      return { updated: false, triggeredAlerts: [] };
    }
    
    // Update the fund
    const updated = updateFollowedFund(fundCode, {
      lastEstimatedValue: estimate.estimatedUnit,
      lastEstimatedRate: estimate.estimatedRate,
      lastCheck: new Date().toISOString(),
    });
    
    // Check alerts
    const triggeredAlerts = checkFundAlerts(
      fundCode,
      estimate.estimatedUnit,
      estimate.estimatedRate
    );
    
    // Update alert trigger counts
    for (const alert of triggeredAlerts) {
      updateAlertTrigger(alert.id);
    }
    
    return { updated, triggeredAlerts };
  } catch (error) {
    console.error(`Error updating fund ${fundCode}:`, error);
    return { updated: false, triggeredAlerts: [] };
  }
}
