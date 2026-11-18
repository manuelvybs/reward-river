// node tools/playtest.mjs [baseUrl] [outDir]
// Headless GPU Chromium plays the whole level with ?autopilot, screenshots every beat, and fails on any console
// error, page error or failed request, or if the lagoon is not reached.
import { chromium } from 'playwright';
import fs from 'node:fs';
const base = process.argv[2] || 'http://localhost:4173/index.html';
const out = process.argv[3] || 'tools/playtest';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', m => m.type() === 'error' && errors.push('console: ' + m.text()));
page.on('pageerror', e => errors.push('pageerror: ' + e));
page.on('requestfailed', r => errors.push('requestfailed: ' + r.url()));
page.on('response', r => r.status() >= 400 && errors.push(`http ${r.status()}: ${r.url()}`));
const t0 = Date.now();
await page.goto(base + (base.includes('?') ? '&' : '?') + 'autopilot');
await page.waitForFunction(() => window.__game?.ready, null, { timeout: 30000 });
const L = await page.evaluate(() => window.__game.level);
const beats = [
  ['title', s => true],
  ['trail', s => s.mode === 'foot' && s.z < -8],
  ['jump', s => s.mode === 'air' && s.z < L.edgeZ - 0.5],
  ['swing', s => s.mode === 'rope' && s.z < -64],
  ['landing', s => s.mode === 'foot' && s.z < L.farZ - 3],
  ['steps', s => s.mode === 'foot' && s.z < -100],
  ['raft', s => s.mode === 'raft' && s.s > 25],
  ['beam', s => s.mode === 'raft' && s.s > L.beamS - 9],
  ['arch', s => s.mode === 'raft' && s.s > L.archS - 14],
  ['rapids', s => s.mode === 'raft' && s.z < -505],
  ['end', s => s.state === 'end'],
];
let b = 0, last = null, fps = [];
while (b < beats.length && Date.now() - t0 < 200000) {
  const s = await page.evaluate(() => window.__game.state());
  last = s;
  if (beats[b][1].call(null, s)) {
    if (beats[b][0] === 'end') await page.waitForTimeout(2400);
    await page.screenshot({ path: `${out}/${String(b).padStart(2, '0')}-${beats[b][0]}.png` });
    console.log(`${beats[b][0].padEnd(8)} t=${s.time}s mode=${s.mode} z=${s.z} s=${s.s} medals=${s.medals} respawns=${s.respawns}`);
    b++;
  }
  await page.waitForTimeout(40);
}
fps = await page.evaluate(() => new Promise(r => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 1000) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); }));
await browser.close();
const ok = b === beats.length && errors.length === 0 && last.respawns === 0;
console.log(`\n${ok ? 'PASS' : 'FAIL'}: ${b}/${beats.length} beats, ${last?.medals} medals, ${last?.respawns} respawns, ${errors.length} errors, ~${fps} fps headless, ${((Date.now() - t0) / 1000).toFixed(0)} s wall`);
if (errors.length) console.log(errors.slice(0, 10).join('\n'));
process.exit(ok ? 0 : 1);
