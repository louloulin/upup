// Minimal repro: `bun build --compile --bytecode` rejects top-level await.
//   bun build --compile --bytecode --outfile=/tmp/x scripts/perf/tla/tla-fails.ts
//   → error: "await" can only be used inside an "async" function
// Plain `--compile` (and `--compile --minify`) build this file fine.
const value = await Promise.resolve(1);
console.log('tla', value);
