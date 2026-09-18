// Cosine similarity over the memory store: the repo's only real per-item CPU loop.
function cosineSimScalar(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i += 1) { dot += a[i]! * b[i]!; na += a[i]! * a[i]!; nb += b[i]! * b[i]!; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
const DIM = 1536;                         // text-embedding-3-small
const N = 5000;                           // a plausible memory store
const q = Array.from({ length: DIM }, () => Math.random());
const docs = Array.from({ length: N }, () => Array.from({ length: DIM }, () => Math.random()));

let t = performance.now();
let best = -1;
for (const d of docs) best = Math.max(best, cosineSimScalar(q, d));
const scalar = performance.now() - t;
console.log(`brute-force cosine over ${N} x ${DIM}d docs: ${scalar.toFixed(1)}ms  (best=${best.toFixed(4)})`);

// Same math over Float32Array: what a vectorized/Buffered path would buy.
const qf = Float32Array.from(q);
const docf = docs.map((d) => Float32Array.from(d));
t = performance.now();
let best2 = -1;
for (const d of docf) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < DIM; i += 1) { dot += qf[i]! * d[i]!; na += qf[i]! * qf[i]!; nb += d[i]! * d[i]!; }
  best2 = Math.max(best2, dot / (Math.sqrt(na) * Math.sqrt(nb) || 1));
}
const typed = performance.now() - t;
console.log(`same, Float32Array path                     : ${typed.toFixed(1)}ms  (${(scalar / typed).toFixed(2)}x)`);
console.log(`\nnote: the query norm (na) is recomputed per doc -- hoistable, ~1/3 of the work`);
