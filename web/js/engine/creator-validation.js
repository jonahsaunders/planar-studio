/* Shared bounded inputs for the parametric creators, including imported JSON. */
export function range(c, key, min, max, integer = false) {
  const v = c[key];
  if (!Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) {
    throw new Error(`${key} must be ${integer ? 'an integer ' : ''}between ${min} and ${max}.`);
  }
  return v;
}

export function choice(c, key, values) {
  if (!values.includes(c[key])) throw new Error(`Unknown ${key}: ${c[key]}.`);
  return c[key];
}

export function positiveMatrix(matrix) {
  // Cholesky: pairwise |k| bounds alone do not establish a passive multiport.
  const n = matrix.length, d = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let v = matrix[i][j];
    for (let k = 0; k < j; k++) v -= d[i][k] * d[j][k];
    if (i === j) {
      if (!(v > 0) || !Number.isFinite(v)) throw new Error('Inductance matrix is not positive definite. Increase winding separation or solver resolution.');
      d[i][j] = Math.sqrt(v);
    } else d[i][j] = v / d[j][j];
  }
}
