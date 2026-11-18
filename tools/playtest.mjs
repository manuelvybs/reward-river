// node tools/playtest.mjs [baseUrl] [outDir] [--video] [--direct]
//   default: ?autopilot=keys (decisions sent as key presses through the real Input path); --direct feeds the autopilot
//   straight into the player. --video records the run to <outDir>/playtest.webm (+ mp4 via ffmpeg).
// Headless GPU Chromium plays the whole level with ?autopilot, screenshots every beat, and fails on any console
// error, page error or failed request, or if the lagoon is not reached.
import { chromium } from 'playwright';
import fs from 'node:fs';
const args = process.argv.slice(2), flags = new Set(args.filter(a => a.startsWith('--'))), pos = args.filter(a => !a.startsWith('--'));
const base = pos[0] || 'http://localhost:4173/index.html';
const out = pos[1] || 'tools/playtest';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, ...(flags.has('--video') ? { recordVideo: { dir: out + '/video', size: { width: 1280, height: 720 } } } : {}) });
const page = await context.newPage();
const errors = [];
page.on('console', m => m.type() === 'error' && errors.push('console: ' + m.text()));
page.on('pageerror', e => errors.push('pageerror: ' + e));
const failed = new Map();   // a failed request only counts if the game never fetched that URL afterwards (it retries once)
const optional = u => /fonts\.(googleapis|gstatic)\.com/.test(u);   // web font: the game falls back to a system font
page.on('requestfailed', r => (optional(r.url()) ? console.warn('warning: font request failed', r.url()) : failed.set(r.url(), r.failure()?.errorText)));
page.on('requestfinished', r => failed.delete(r.url()));
page.on('response', r => r.status() >= 400 && !optional(r.url()) && errors.push(`http ${r.status()}: ${r.url()}`));
const t0 = Date.now();
await page.goto(base + (base.includes('?') ? '&' : '?') + (flags.has('--direct') ? 'autopilot' : 'autopilot=keys'));
await page.waitForFunction(() => window.__game?.ready, null, { timeout: 30000 });
const L = await page.evaluate(() => window.__game.level);
await page.evaluate(() => window.__game.sound.start());
await page.waitForFunction(() => window.__game.sound.ready, null, { timeout: 30000 });
const audio = await page.evaluate(() => ({ loaded: Object.keys(window.__game.sound.buf).length, errors: window.__game.sound.errors }));
console.log(`audio: ${audio.loaded} sounds decoded${audio.errors.length ? ', errors: ' + audio.errors.join(', ') : ''}`);
if (audio.errors.length) errors.push(...audio.errors.map(e => 'audio: ' + e));
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
    const info = await page.evaluate(() => window.__game.info());
    console.log(`${beats[b][0].padEnd(8)} t=${s.time}s mode=${s.mode} z=${s.z} s=${s.s} medals=${s.medals} respawns=${s.respawns}  draws=${info.calls} tris=${(info.tris / 1000).toFixed(0)}k fps=${info.fps} q=${info.quality}`);
    b++;
  }
  await page.waitForTimeout(40);
}
fps = await page.evaluate(() => new Promise(r => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 1000) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); }));
const video = page.video();
await context.close();
if (video) {
  const webm = await video.path(), mp4 = `${out}/playtest.mp4`;
  const { execFileSync } = await import('node:child_process');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-crf', '24', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
  console.log('video:', mp4);
}
await browser.close();
for (const [u, why] of failed) errors.push(`requestfailed: ${u} (${why})`);
const ok = b === beats.length && errors.length === 0 && last.respawns === 0;
console.log(`\n${ok ? 'PASS' : 'FAIL'}: ${b}/${beats.length} beats, ${last?.medals} medals, ${last?.respawns} respawns, ${errors.length} errors, ~${fps} fps headless, ${((Date.now() - t0) / 1000).toFixed(0)} s wall`);
if (errors.length) console.log(errors.slice(0, 10).join('\n'));
fs.writeFileSync(`${out}/result.json`, JSON.stringify({ ok, beats: b, medals: last?.medals, respawns: last?.respawns, errors, at: new Date().toISOString() }, null, 2));
process.exit(ok ? 0 : 1);
