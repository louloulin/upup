export interface RegressionResult {
  readonly coefficients: readonly number[];
  readonly intercept: number;
  readonly rSquared: number;
  readonly residuals: readonly number[];
  readonly fitted: readonly number[];
}

export function regress(
  y: readonly number[],
  X: readonly (readonly number[])[],
): RegressionResult {
  if (X.length === 0) {
    return { coefficients: [], intercept: mean(y), rSquared: 0, residuals: y.slice(), fitted: y.slice() };
  }
  const n = y.length;
  const k = X.length;
  if (n < 2) {
    return {
      coefficients: new Array(k).fill(0),
      intercept: y[0] ?? 0,
      rSquared: 0,
      residuals: y.slice(),
      fitted: y.slice(),
    };
  }

  // Normal equations: (X'X) beta = X'y
  // Build X'X (k+1 x k+1) with intercept column
  const dim = k + 1;
  const xtx: number[][] = Array.from({ length: dim }, () => new Array(dim).fill(0));
  const xty: number[] = new Array(dim).fill(0);

  for (let i = 0; i < n; i++) {
    const yi = y[i];
    for (let j = 0; j < k; j++) {
      const xji = X[j][i];
      xty[j + 1] += xji * yi;
      for (let l = 0; l < k; l++) {
        xtx[j + 1][l + 1] += xji * X[l][i];
      }
    }
    xty[0] += yi;
    for (let j = 0; j < k; j++) {
      xtx[j + 1][0] += X[j][i];
      xtx[0][j + 1] += X[j][i];
    }
    xtx[0][0] += 1;
  }

  const augmented = xtx.map((row, i) => [...row, xty[i]]);
  const solved = gaussianElimination(augmented);
  const intercept = solved[0] ?? 0;
  const coefficients = solved.slice(1);

  const fitted: number[] = new Array(n);
  const residuals: number[] = new Array(n);
  let ssRes = 0;
  let ssTot = 0;
  const yMean = mean(y);
  for (let i = 0; i < n; i++) {
    let yhat = intercept;
    for (let j = 0; j < k; j++) yhat += (coefficients[j] ?? 0) * (X[j][i] ?? 0);
    fitted[i] = yhat;
    residuals[i] = y[i] - yhat;
    ssRes += (y[i] - yhat) ** 2;
    ssTot += (y[i] - yMean) ** 2;
  }
  const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  return { coefficients, intercept, rSquared, residuals, fitted };
}

function gaussianElimination(matrix: number[][]): number[] {
  const n = matrix.length;
  if (n === 0) return [];
  const m = matrix.map((row) => row.slice());
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(m[r][i]) > Math.abs(m[pivot][i])) pivot = r;
    }
    if (pivot !== i) [m[i], m[pivot]] = [m[pivot], m[i]];
    if (Math.abs(m[i][i]) < 1e-12) continue;
    for (let r = i + 1; r < n; r++) {
      const factor = m[r][i] / m[i][i];
      for (let c = i; c <= n; c++) m[r][c] -= factor * m[i][c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = m[i][n];
    for (let j = i + 1; j < n; j++) sum -= m[i][j] * x[j];
    x[i] = m[i][i] === 0 ? 0 : sum / m[i][i];
  }
  return x;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function orthogonalize(
  targetFactor: readonly number[],
  referenceFactors: readonly (readonly number[])[],
): readonly number[] {
  const ref = regress(targetFactor, referenceFactors);
  return ref.residuals;
}

export function neutralizeIndustryMomentum(
  factorValues: readonly number[],
  industryReturns: readonly (readonly number[])[],
): readonly number[] {
  return orthogonalize(factorValues, industryReturns);
}
