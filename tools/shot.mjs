// node tools/shot.mjs <url> <out.png> [width] [height] [waitMs]
// Headless screenshot of a local page (GPU chromium; waits for window.__viewer?.ready or window.__game?.ready).
import { chromium } from 'playwright';
const [url, out, w = 1800, h = 560, wait = 1500] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2 });
const errors = []; page.on('console', m => m.type() === 'error' && errors.push(m.text())); page.on('pageerror', e => errors.push(String(e)));
await page.goto(url);
await page.waitForFunction(() => window.__viewer?.ready || window.__game?.ready, null, { timeout: 30000 });
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
await browser.close();
console.log(out, errors.length ? `console errors: ${errors.join(' | ')}` : '0 console errors');
