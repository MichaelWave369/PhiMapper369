import type { Corners, Point } from '../model';

// Compute H for source (u,v) -> destination (x,y). Values are normalized 0..1.
// Solve the eight projective coefficients with partial-pivoting Gaussian elimination.
export function homographyFromQuad(points: Corners): number[] {
  const uv: Point[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  const rows: number[][] = [];
  uv.forEach((p, i) => {
    const q = points[i];
    rows.push([p.x, p.y, 1, 0, 0, 0, -p.x * q.x, -p.y * q.x, q.x]);
    rows.push([0, 0, 0, p.x, p.y, 1, -p.x * q.y, -p.y * q.y, q.y]);
  });
  for (let c = 0; c < 8; c++) {
    let pivot = c;
    for (let r = c + 1; r < 8; r++) {
      if (Math.abs(rows[r][c]) > Math.abs(rows[pivot][c])) pivot = r;
    }
    if (Math.abs(rows[pivot][c]) < 1e-9) throw new Error('Warp corners are degenerate.');
    [rows[pivot], rows[c]] = [rows[c], rows[pivot]];
    const divisor = rows[c][c];
    for (let j = c; j <= 8; j++) rows[c][j] /= divisor;
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const factor = rows[r][c];
      for (let j = c; j <= 8; j++) rows[r][j] -= factor * rows[c][j];
    }
  }
  const h = rows.map(row => row[8]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

export function inverse3x3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = c * h - b * i, C = b * f - c * e;
  const D = f * g - d * i, E = a * i - c * g, F = c * d - a * f;
  const G = d * h - e * g, H = b * g - a * h, I = a * e - b * d;
  const determinant = a * A + b * D + c * G;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) {
    throw new Error('Warp has zero area.');
  }
  return [A, B, C, D, E, F, G, H, I].map(x => x / determinant);
}

export function transform(m: number[], p: Point): Point {
  const w = m[6] * p.x + m[7] * p.y + m[8];
  if (Math.abs(w) < 1e-12) throw new Error('Projective point at infinity.');
  return {
    x: (m[0] * p.x + m[1] * p.y + m[2]) / w,
    y: (m[3] * p.x + m[4] * p.y + m[5]) / w,
  };
}

// WebGL mat3 uniforms are column-major, unlike our CPU row-major matrices.
export function toGlMatrix(m: number[]): Float32Array {
  return new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
}
