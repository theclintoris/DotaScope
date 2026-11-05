import { chromium } from 'playwright-core';

const port = process.env.CDP_PORT ?? '9222';
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const context = browser.contexts()[0];
const pages = context?.pages() ?? [];
if (!pages.length) {
  console.error('No WebView2 pages found');
  process.exit(1);
}

const page = pages.find((p) => p.url().includes('dotascope.local')) ?? pages[0];
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
});

await page.waitForTimeout(2500);
console.log(JSON.stringify({
  url: page.url(),
  title: await page.title(),
  viewport: page.viewportSize(),
  shell: await page.locator('.app-shell').count(),
  heroes: await page.locator('.pulse-row').count(),
  errors,
}, null, 2));
await page.screenshot({ path: 'screenshots/native-home.png' });

await page.evaluate(() => { window.location.hash = '#/players'; });
await page.waitForTimeout(1200);
const input = page.locator('.player-search-box input');
await input.fill('295731192');
await input.press('Enter');
await page.waitForTimeout(4500);
console.log(JSON.stringify({
  url: page.url(),
  title: await page.title(),
  player: await page.locator('.player-hero-copy h1').first().textContent().catch(() => null),
  heroRows: await page.locator('.player-hero-table tbody tr').count(),
  error: await page.locator('.state-error').count(),
  errors,
}, null, 2));
await page.screenshot({ path: 'screenshots/native-player.png', fullPage: true });

process.exit(0);
