// Real geography for a region close-up: the world's land outlines and this province's own outline, rasterised around the
// region and turned into signed distance fields (in region units; negative = inside / on land).
// terrain.js uses them so the coast is the real coast and the province stands out in its real shape.

// geo: { land: [[[x,z],...], ...], prov: [[[x,z],...], ...] } in region coordinates
export function buildMasks(geo, ext, res = 512) {
  const cell = 2 * ext / res;
  const raster = rings => {
    const cv = document.createElement('canvas'); cv.width = cv.height = res;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    for (const r of rings) {
      if (!r || r.length < 3) continue;
      ctx.beginPath();
      r.forEach(([x, z], i) => { const px = (x + ext) / cell, pz = (z + ext) / cell; if (i) ctx.lineTo(px, pz); else ctx.moveTo(px, pz); });
      ctx.closePath(); ctx.fill();
    }
    const a = ctx.getImageData(0, 0, res, res).data, m = new Uint8Array(res * res);
    for (let i = 0; i < m.length; i++) m[i] = a[i * 4 + 3] > 127 ? 1 : 0;
    return m;
  };
  const land = sdf(raster(geo.land), res, cell), prov = sdf(raster(geo.prov), res, cell);
  const sample = (G, x, z) => {
    const fx = Math.max(0, Math.min(res - 1.001, (x + ext) / cell - .5)), fz = Math.max(0, Math.min(res - 1.001, (z + ext) / cell - .5));
    const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, i = iz * res + ix;
    const a = G[i] + (G[i + 1] - G[i]) * tx, b = G[i + res] + (G[i + res + 1] - G[i + res]) * tx;
    return a + (b - a) * tz;
  };
  return { land, prov, landAt: (x, z) => sample(land, x, z), provAt: (x, z) => sample(prov, x, z) };
}

// signed distance (two-pass chamfer, close to Euclidean): negative inside the mask, positive outside
function sdf(mask, n, cell) {
  const dist = inside => {
    const INF = 1e9, d = new Float32Array(n * n);
    for (let i = 0; i < d.length; i++) d[i] = (mask[i] === 1) === inside ? INF : 0;
    const A = 1, B = Math.SQRT2;
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
      const i = z * n + x; let v = d[i]; if (!v) continue;
      if (x > 0) v = Math.min(v, d[i - 1] + A);
      if (z > 0) { v = Math.min(v, d[i - n] + A); if (x > 0) v = Math.min(v, d[i - n - 1] + B); if (x < n - 1) v = Math.min(v, d[i - n + 1] + B); }
      d[i] = v;
    }
    for (let z = n - 1; z >= 0; z--) for (let x = n - 1; x >= 0; x--) {
      const i = z * n + x; let v = d[i]; if (!v) continue;
      if (x < n - 1) v = Math.min(v, d[i + 1] + A);
      if (z < n - 1) { v = Math.min(v, d[i + n] + A); if (x < n - 1) v = Math.min(v, d[i + n + 1] + B); if (x > 0) v = Math.min(v, d[i + n - 1] + B); }
      d[i] = v;
    }
    return d;
  };
  const out = dist(false), inn = dist(true), s = new Float32Array(n * n);
  for (let i = 0; i < s.length; i++) s[i] = (mask[i] ? -(inn[i] - .5) : (out[i] - .5)) * cell;
  return s;
}
