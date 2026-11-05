const { chromium } = require('playwright-core')
const fs = require('fs')
const profile = JSON.parse(fs.readFileSync('.tmp-player.json', 'utf8'))
async function run() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9242')
  const context = browser.contexts()[0]
  const page = context.pages()[0]
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.evaluate(({ profile }) => {
    localStorage.setItem('dotascope.profile.v1', JSON.stringify({ accountId: 295731192, profile, winLoss: null, savedAt: Date.now() }))
    localStorage.setItem('dotascope.population.v1', JSON.stringify('ranked'))
  }, { profile })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  await page.evaluate(() => { location.hash = '#/matches' })
  await page.waitForTimeout(2500)
  await page.getByRole('button', { name: /My matches/ }).click()
  await page.waitForTimeout(10000)
  await page.screenshot({ path: 'screenshots/native-matches-my-ranked.png' })
  const ranked = await page.evaluate(() => ({
    url: location.href,
    mode: document.querySelector('.topbar-mode .is-active')?.textContent?.trim(),
    cards: document.querySelectorAll('.my-match-card').length,
    rows: [...document.querySelectorAll('.my-match-card')].slice(0, 2).map((el) => el.innerText.replace(/\n/g, ' | ')),
    summary: [...document.querySelectorAll('.feed-summary-item')].map((el) => el.innerText.replace(/\n/g, ' | ')),
    scrollWidth: document.body.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  await page.locator('.topbar-mode-btn', { hasText: 'Turbo' }).click()
  await page.waitForTimeout(8000)
  await page.screenshot({ path: 'screenshots/native-matches-my-turbo.png' })
  const turbo = await page.evaluate(() => ({
    mode: document.querySelector('.topbar-mode .is-active')?.textContent?.trim(),
    cards: document.querySelectorAll('.my-match-card').length,
    summary: [...document.querySelectorAll('.feed-summary-item')].map((el) => el.innerText.replace(/\n/g, ' | ')),
    toast: document.querySelector('.auto-parse-toast')?.innerText ?? null,
  }))
  await page.evaluate(() => { location.hash = '#/players/295731192/heroes/35' })
  await page.waitForTimeout(9000)
  await page.screenshot({ path: 'screenshots/native-hero-mode-turbo.png' })
  const hero = await page.evaluate(() => ({
    mode: document.querySelector('.topbar-mode .is-active')?.textContent?.trim(),
    kpis: [...document.querySelectorAll('.kpi-card')].map((el) => el.innerText.replace(/\n/g, ' | ')),
    rows: document.querySelectorAll('tbody tr').length,
  }))
  await page.evaluate(() => { location.hash = '#/parser' })
  await page.waitForTimeout(5000)
  await page.screenshot({ path: 'screenshots/native-parser.png' })
  const parser = await page.evaluate(() => ({
    body: document.body.innerText.slice(0, 600),
    rows: document.querySelectorAll('.replay-row').length,
    worker: document.querySelector('.worker-pill')?.textContent?.trim() ?? null,
  }))
  console.log(JSON.stringify({ ranked, turbo, hero, parser, errors }, null, 2))
}
run().catch((e) => { console.error(e); process.exit(1) })
