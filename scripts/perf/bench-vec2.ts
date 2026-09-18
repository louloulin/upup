function cosineSimScalar(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i += 1) { dot += a[i]! * b[i]!; na += a[i]! * a[i]!; nb += b[i]! * b[i]!; }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}
function cosineSimHoisted(q: number[], qNorm: number, b: number[]): number {
  let dot = 0, nb = 0;
  for (let i = 0; i < q.length; i += 1) { dot += q[i]! * b[i]!; nb += b[i]! * b[i]!; }
  const d = qNorm * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}
const DIM = 1536, N = 5000;
const q = Array.from({ length: DIM }, () => Math.random());
const docs = Array.from({ length: N }, () => Array.from({ length: DIM }, () => Math.random()));
const qNorm = Math.sqrt(q.reduce((s, v) => s + v * v, 0));
const run = (f: () => number) => { for (let i = 0; i < 3; i += 1) f(); const t = performance.now(); const r = f(); return [performance.now() - t, r] as const; };
const [a] = run(() => { let b = -1; for (const d of docs) b = Math.max(b, cosineSimScalar(q, d)); return b; });
const [b] = run(() => { let x = -1; for (const d of docs) x = Math.max(x, cosineSimHoisted(q, qNorm, d)); return x; });
console.log(`cosine over ${N} x ${DIM}d:`);
console.log(`  recompute both norms : ${a.toFixed(1)}ms`);
console.log(`  hoist query norm     : ${b.toFixed(1)}ms  (${(a / b).toFixed(2)}x faster)`);
