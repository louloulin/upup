import type { PiStdioRuntimePort } from './index.js';
import { getPiNativeApp } from './default.js';

export function getPiStdioRuntime(): PiStdioRuntimePort {
  return getPiNativeApp().getStdioRuntime();
}
