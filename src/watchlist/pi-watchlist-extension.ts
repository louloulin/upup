import type { PiUpupExtensionApi } from '../pi-main.js';
import { registerWatchlistExtension } from './pi-watchlist-tool.js';

export function registerWatchlistPiExtension(pi: PiUpupExtensionApi): void {
  registerWatchlistExtension(pi);
}
