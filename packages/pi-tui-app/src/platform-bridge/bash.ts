/**
 * Platform bridge for bash permission mode.
 * During Round 15 (platform tools migration), this will be replaced by @upup/pi-platform.
 * For now it serves as a stable facade so the TUI approval UI can stay self-contained.
 */
export type PermissionMode = 'bypass' | 'allow' | 'ask' | 'deny';

export interface PermissionCheckResult {
  allowed: boolean;
  requiresApproval: boolean;
  mode: PermissionMode;
  hardDenied?: boolean;
  reason?: string;
}

export const PERMISSION_MODE_BEHAVIORS: Record<PermissionMode, string> = {
  bypass: 'Always allow',
  allow: 'Allow without prompt',
  ask: 'Ask user for confirmation',
  deny: 'Always deny',
};

export const HARD_DENY_PATTERNS: readonly RegExp[] = [
  /rm\s+-rf\s+\//,
  /mkfs/,
  /:(){\s*:\|:&\s*};\:/,
];

export function isHardDenyCommand(cmd: string): boolean {
  return HARD_DENY_PATTERNS.some((re) => re.test(cmd));
}

export function checkPermission(_cmd: string, mode: PermissionMode = 'ask'): PermissionCheckResult {
  return { allowed: true, requiresApproval: false, mode };
}

export function checkPermissionWithHardDeny(cmd: string, mode: PermissionMode = 'ask'): PermissionCheckResult {
  if (isHardDenyCommand(cmd)) {
    return { allowed: false, requiresApproval: false, hardDenied: true, reason: 'Hard-deny pattern detected', mode };
  }
  return { allowed: true, requiresApproval: false, mode };
}

export function requiresConfirmation(_cmd: string): boolean {
  return false;
}

export function isAllowed(_cmd: string, _mode?: PermissionMode): boolean {
  return true;
}
