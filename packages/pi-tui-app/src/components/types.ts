/**
 * Local UI types for @upup/pi-tui-app/components.
 */
export type WorkingStatus = 'idle' | 'thinking' | 'streaming' | 'tool' | 'compacting' | 'approval';

export interface WorkingState {
  status: WorkingStatus;
  active?: boolean;
  message?: string;
  toolName?: string;
  startedAt?: number;
}
