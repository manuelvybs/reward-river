// Reward River — VYBS gift card art, drawn once per value on a canvas (used by the 3D cards, the pop-up and the
// end screen). Waits briefly for the Kanit web font and the white VYBS wordmark; falls back gracefully without them.
const W = 512, H = 320;

function roundRect(x, c, w, h, r) {
  x.beginPath(); x.moveTo(c[0] + r, c[1]); x.arcTo(c[0] + w, c[1], c[0] + w, c[1] + h, r); x.arcTo(c[0] + w, c[1] + h, c[0], c[1] + h, r);
  x.arcTo(c[0], c[1] + h, c[0], c[1], r); x.arcTo(c[0], c[1], c[0] + w, c[1], r); x.closePath();
}
function sparkle(x, cx, cy, ro, ri, fill) {
  x.beginPath();
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 - Math.PI / 2, b = a + Math.PI / 4, n = a + Math.PI / 2;
    if (k === 0) x.moveTo(cx + Math.cos(a) * ro, cy + Math.sin(a) * ro);
    x.quadraticCurveTo(cx + Math.cos(b) * ri, cy + Math.sin(b) * ri, cx + Math.cos(n) * ro, cy + Math.sin(n) * ro);
  }
  x.closePath(); x.fillStyle = fill; x.fill();
}

export async function loadCardArt(logoUrl = 'assets/brand/vybs-white.svg') {
  const timeout = ms => new Promise(r => setTimeout(r, ms));
  const font = Promise.race([Promise.all([document.fonts?.load('700 140px Kanit'), document.fonts?.load('600 26px Kanit')]), timeout(2500)]).catch(() => {});
  const logo = await Promise.race([new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = logoUrl; }), timeout(2500).then(() => null)]);
  await font;
  const cache = new Map();
  return function drawCard(value) {
    if (cache.has(value)) return cache.get(value);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'), big = value >= 25;
    roundRect(x, [0, 0], W, H, 38); x.save(); x.clip();
    const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#7280ff'); g.addColorStop(0.55, '#5b69fe'); g.addColorStop(1, '#3a43c4');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    sparkle(x, 400, 215, 150, 30, 'rgba(255,255,255,0.08)');                       // big faint sparkle behind
    for (const [sx, sy, r] of [[300, 60, 6], [470, 150, 5], [250, 270, 4], [140, 140, 4]]) sparkle(x, sx, sy, r * 2, r * 0.5, 'rgba(255,255,255,0.35)');
    x.restore();
    if (logo) { const h = 50, w = h * logo.width / logo.height; x.drawImage(logo, 38, 34, w, h); }
    else { x.fillStyle = '#fff'; x.font = '700 48px Kanit, system-ui, sans-serif'; x.fillText('VYBS', 38, 80); }
    sparkle(x, 452, 72, 34, 7, '#ffd401');
    x.fillStyle = '#ffffff'; x.font = '700 132px Kanit, system-ui, sans-serif'; x.textBaseline = 'alphabetic';
    x.shadowColor = 'rgba(30,20,90,0.35)'; x.shadowBlur = 10; x.shadowOffsetY = 4;
    x.fillText(`$${value}`, 34, 236);
    x.shadowColor = 'transparent';
    x.fillStyle = '#ffd401'; x.font = '600 26px Kanit, system-ui, sans-serif';
    if ('letterSpacing' in x) x.letterSpacing = '6px';
    x.fillText('GIFT CARD', 40, 284);
    if (big) { roundRect(x, [5, 5], W - 10, H - 10, 34); x.lineWidth = 10; x.strokeStyle = '#ffd401'; x.stroke(); }
    cache.set(value, c);
    return c;
  };
}
