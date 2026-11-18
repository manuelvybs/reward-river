// Image processing for the painted assets (sharp, raw pixels).
//   node tools/paint-process.mjs tile <in.png> <out.webp> [size=1024]
//       seamless tile: 4 copies offset by half, each weighted by a tent that is 0 on its own seams (weights sum to 1)
//   node tools/paint-process.mjs keywhite <in.png> <out.webp> [width]
//       transparent where the near-white background connects to the border (flood fill), soft 2 px edge
//   node tools/paint-process.mjs keydark <in.png> <out.webp> [width]
//       white sprite with alpha from brightness over a dark background (foam)
import sharp from 'sharp';

const [cmd, inPath, outPath, sizeArg] = process.argv.slice(2);

if (cmd === 'tile') {
  const N = +(sizeArg || 1024);
  const { data } = await sharp(inPath).removeAlpha().resize(N, N, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(N * N * 3), h = N / 2;
  const tent = u => 1 - Math.abs(2 * u / N - 1);        // 0 at u = 0 / N (the copy's seam), 1 in the middle
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let r = 0, g = 0, b = 0;
    for (const [sx, sy] of [[0, 0], [h, 0], [0, h], [h, h]]) {
      const u = (x + sx) % N, v = (y + sy) % N, w = tent(u) * tent(v), o = (v * N + u) * 3;
      r += data[o] * w; g += data[o + 1] * w; b += data[o + 2] * w;
    }
    const o = (y * N + x) * 3; out[o] = r; out[o + 1] = g; out[o + 2] = b;
  }
  await sharp(out, { raw: { width: N, height: N, channels: 3 } }).webp({ quality: 86 }).toFile(outPath);
}

if (cmd === 'keywhite' || cmd === 'keydark') {
  let img = sharp(inPath).removeAlpha();
  if (sizeArg) img = img.resize(+sizeArg);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, rgba = Buffer.alloc(W * H * 4);
  if (cmd === 'keywhite') {
    const near = i => Math.min(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]) > 238;
    const bg = new Uint8Array(W * H), stack = [];
    for (let x = 0; x < W; x++) { stack.push(x, (H - 1) * W + x); }
    for (let y = 0; y < H; y++) { stack.push(y * W, y * W + W - 1); }
    while (stack.length) { const i = stack.pop(); if (bg[i] || !near(i)) continue; bg[i] = 1; const x = i % W, y = (i / W) | 0;
      if (x > 0) stack.push(i - 1); if (x < W - 1) stack.push(i + 1); if (y > 0) stack.push(i - W); if (y < H - 1) stack.push(i + W); }
    // alpha: 0 on the background, feathered over 2 px
    const a = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) a[i] = bg[i] ? 0 : 1;
    for (let pass = 0; pass < 2; pass++) for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x; if (a[i] === 0) continue;
      a[i] = Math.min(a[i], (a[i - 1] + a[i + 1] + a[i - W] + a[i + W] + a[i] * 4) / 8);
    }
    for (let i = 0; i < W * H; i++) { rgba[i * 4] = data[i * 3]; rgba[i * 4 + 1] = data[i * 3 + 1]; rgba[i * 4 + 2] = data[i * 3 + 2]; rgba[i * 4 + 3] = Math.round(a[i] * 255); }
  } else {
    for (let i = 0; i < W * H; i++) {
      const l = (0.3 * data[i * 3] + 0.59 * data[i * 3 + 1] + 0.11 * data[i * 3 + 2]) / 255;
      const a = Math.min(1, Math.max(0, (l - 0.42) / 0.45));
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = 255; rgba[i * 4 + 3] = Math.round(a * 255);
    }
  }
  await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).webp({ quality: 86, alphaQuality: 90 }).toFile(outPath);
}
console.error('wrote', outPath);
