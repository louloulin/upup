import { collectPiToolCatalog } from "/Users/lougoulin/appx/upup/packages/mcp-server/src/pi-tool-bridge.ts";
const r = await collectPiToolCatalog();
console.log("totalTools:", r.tools.length);
const names = r.tools.map(t => t.name).sort();
console.log("first 30:");
for (const n of names.slice(0,30)) console.log("  " + n);
