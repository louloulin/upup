// Control: the same await wrapped in an async IIFE builds with --bytecode.
//   bun build --compile --bytecode --outfile=/tmp/x scripts/perf/tla/iife-works.ts
//   → success
const main = async () => {
  const value = await Promise.resolve(41);
  console.log('iife', value + 1);
};
void main();
