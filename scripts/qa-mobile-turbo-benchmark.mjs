import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
})
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, isMobile: true })
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
await page.goto('http://127.0.0.1:4176/#/players/295731192', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.player-hero h1', { timeout: 30000 })
const turbo = page.locator('.topbar-mode-btn', { hasText: 'Turbo' })
if (await turbo.count()) await turbo.click()
await page.waitForTimeout(6000)
const report = {
  title: await page.title(),
  mode: await page.locator('.topbar-mode-btn.is-active').innerText().catch(() => ''),
  benchmark: await page.getByText('Turbo games, benchmarked').count(),
  width: await page.evaluate(() => ({ inner: window.innerWidth, scroll: document.body.scrollWidth })),
  errors,
}
await page.locator('.performance-review').first().scrollIntoViewIfNeeded().catch(() => {})
await page.screenshot({ path: 'screenshots/turbo-benchmark-mobile.png', fullPage: false })
console.log(JSON.stringify(report, null, 2))
await browser.close()
