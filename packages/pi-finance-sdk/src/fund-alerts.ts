export type NativeFundAlertType = 'price_above' | 'price_below' | 'change_up' | 'change_down' | 'estimate_update';

export interface NativeFundAlert {
  readonly id: string;
  readonly fundCode: string;
  readonly fundName: string;
  readonly type: NativeFundAlertType;
  readonly value?: number;
  readonly enabled: boolean;
  readonly triggerCount: number;
  readonly createdAt: string;
}

export interface NativeFundAlertState {
  readonly schema: 1;
  readonly alerts: Readonly<Record<string, NativeFundAlert>>;
}

export function createInitialFundAlertState(): NativeFundAlertState {
  return { schema: 1, alerts: {} };
}

export function createNativeFundAlert(
  state: NativeFundAlertState,
  alert: Omit<NativeFundAlert, 'enabled' | 'triggerCount'>,
): { readonly state: NativeFundAlertState; readonly created: NativeFundAlert } {
  if (state.alerts[alert.id]) throw new Error(`alert id already exists: ${alert.id}`);
  if (alert.type !== 'estimate_update' && (alert.value === undefined || !Number.isFinite(alert.value))) {
    throw new Error('value is required for price and change alerts');
  }
  const created: NativeFundAlert = { ...alert, enabled: true, triggerCount: 0 };
  return { state: { schema: 1, alerts: { ...state.alerts, [created.id]: created } }, created };
}

export function listNativeFundAlerts(state: NativeFundAlertState, fundCode?: string): readonly NativeFundAlert[] {
  return Object.values(state.alerts)
    .filter((alert) => fundCode === undefined || alert.fundCode === fundCode)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function deleteNativeFundAlert(
  state: NativeFundAlertState,
  alertId: string,
): { readonly state: NativeFundAlertState; readonly deleted: boolean } {
  if (!state.alerts[alertId]) return { state, deleted: false };
  const alerts = { ...state.alerts };
  delete alerts[alertId];
  return { state: { schema: 1, alerts }, deleted: true };
}
