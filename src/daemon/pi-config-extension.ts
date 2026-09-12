/**
 * Config extension — pi-coding-agent extension that registers
 * the strict-shape config tools.
 *
 * Pass 7 prototype (Batch 1 / config extension). Demonstrates that
 * a multi-tool extension can be split out of the LangChain registry
 * layer (`src/tools/registry/domain-tools.ts`) and registered
 * directly through the pi runtime, without touching the LangChain
 * agent loop.
 *
 * The fake api in `src/pi-main.ts` accepts both shapes in one
 * extension, so the LangChain `config_get/set/list` (registered by
 * `domain-tools.ts` elsewhere) and the strict-shape variants here
 * coexist without conflict.
 */

import type { PiUpupExtensionApi } from '../pi-main.js';
import {
  createConfigGetTool,
  createConfigSetTool,
  createConfigListTool,
} from './pi-config-tool.js';

/** Register the config extension on a pi ExtensionAPI (real or fake). */
export function registerConfigExtension(pi: PiUpupExtensionApi): void {
  pi.registerTool(createConfigGetTool());
  pi.registerTool(createConfigSetTool());
  pi.registerTool(createConfigListTool());
}
