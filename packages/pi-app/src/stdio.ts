import type { PiStdioRuntimePort } from './index';
import { getPiNativeApp } from './default';

export function getPiStdioRuntime(): PiStdioRuntimePort {
  return getPiNativeApp().getStdioRuntime();
}
