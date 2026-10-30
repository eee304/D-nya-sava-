// Deterministic noise, random numbers and polyline helpers for region generation.

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
// smoothstep that also works with a > b (reversed edge)
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 2147483646 + 1;
}
// Park–Miller generator: same seed -> same region every time
export function makeRng(seed) {
  let s = seed % 2147483647 || 1;
  return () => (s = s * 48271 % 2147483647) / 2147483647;
}

export function hash(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// value noise; P = period for tileable textures
export function vnoise(x, y, P) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const w = P ? (a => ((a % P) + P) % P) : (a => a);
  const a = hash(w(xi), w(yi)), b = hash(w(xi + 1), w(yi)), c = hash(w(xi), w(yi + 1)), d = hash(w(xi + 1), w(yi + 1));
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, o = 4) {
  let s = 0, a = .5, f = 1, n = 0;
  for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); n += a; f *= 2; a *= .5; }
  return s / n;
}

export function segD(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
export function polyD(p, x, z) {
  let m = 1e9;
  for (let i = 0; i < p.length - 1; i++) m = Math.min(m, segD(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]));
  return m;
}
export function polyLen(p) {
  let L = 0;
  for (let i = 0; i < p.length - 1; i++) L += Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
  return L;
}
// point + unit direction at arc length s along a polyline
export function along(p, s) {
  s = clamp(s, 0, polyLen(p) - 1e-4);
  for (let i = 0; i < p.length - 1; i++) {
    const dx = p[i + 1][0] - p[i][0], dz = p[i + 1][1] - p[i][1], l = Math.hypot(dx, dz);
    if (s <= l) return { x: p[i][0] + dx * s / l, z: p[i][1] + dz * s / l, dx: dx / l, dz: dz / l };
    s -= l;
  }
  const n = p.length - 1;
  return { x: p[n][0], z: p[n][1], dx: 1, dz: 0 };
}
export const pingpong = (t, L) => { const m = t % (2 * L); return m < L ? [m, 1] : [2 * L - m, -1]; };
