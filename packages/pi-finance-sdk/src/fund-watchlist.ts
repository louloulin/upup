export interface NativeFundWatchEntry {
  readonly code: string;
  readonly name: string;
  readonly note?: string;
  readonly addedAt: string;
}

export interface NativeFundWatchlistState {
  readonly schema: 1;
  readonly funds: Readonly<Record<string, NativeFundWatchEntry>>;
}

export function createInitialFundWatchlistState(): NativeFundWatchlistState {
  return { schema: 1, funds: {} };
}

export function followNativeFund(
  state: NativeFundWatchlistState,
  fund: Omit<NativeFundWatchEntry, 'addedAt'>,
  addedAt: string,
): { readonly state: NativeFundWatchlistState; readonly added: boolean } {
  if (state.funds[fund.code]) return { state, added: false };
  return {
    state: { schema: 1, funds: { ...state.funds, [fund.code]: { ...fund, addedAt } } },
    added: true,
  };
}

export function unfollowNativeFund(
  state: NativeFundWatchlistState,
  fundCode: string,
): { readonly state: NativeFundWatchlistState; readonly removed: boolean } {
  if (!state.funds[fundCode]) return { state, removed: false };
  const funds = { ...state.funds };
  delete funds[fundCode];
  return { state: { schema: 1, funds }, removed: true };
}

export function listNativeFollowedFunds(state: NativeFundWatchlistState): readonly NativeFundWatchEntry[] {
  return Object.values(state.funds).sort((left, right) => left.addedAt.localeCompare(right.addedAt));
}
