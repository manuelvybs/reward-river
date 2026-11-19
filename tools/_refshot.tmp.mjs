import { chromium } from 'playwright';
const out = process.argv[2];
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.goto('https://fal-video-to-game.vercel.app/A02_PAPER-MOON-STAIRS/index.html');
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/0-title.png` });
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/1-start.png` });
await page.keyboard.down('ArrowRight');
const marks = [8, 16, 22, 26, 30, 36, 45, 58, 62, 72, 82, 88];
let i = 2;
for (const m of marks) {
  for (let k = 0; k < 400; k++) {
    const s = await page.evaluate(() => window.__game.P.s);
    if (s >= m) break;
    // jump spam near gaps
    if ((s > 22 && s < 35) || (s > 53 && s < 67)) { await page.keyboard.press('Space'); }
    await page.waitForTimeout(120);
  }
  const st = await page.evaluate(() => ({ s: window.__game.P.s.toFixed(1), y: window.__game.P.y.toFixed(2), mode: window.__game.world.mode, c: window.__game.world.collected }));
  console.log(m, JSON.stringify(st));
  await page.screenshot({ path: `${out}/${String(i++).padStart(2,'0')}-s${m}.png` });
}
await page.keyboard.up('ArrowRight');
for (const t of [3000, 4000, 5000, 5000]) { await page.waitForTimeout(t); await page.screenshot({ path: `${out}/${String(i++).padStart(2,'0')}-end.png` }); }
console.log('errors', errs);
await browser.close();
