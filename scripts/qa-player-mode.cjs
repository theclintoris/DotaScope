const { chromium } = require('playwright-core')
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const fs = require('fs')
const profile = JSON.parse(fs.readFileSync('.tmp-player.json', 'utf8'))
const BASE = 'http://localhost:4177'

async function run() {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
  await context.addInitScript(({ profile }) => {
    localStorage.setItem('dotascope.profile.v1', JSON.stringify({
      accountId: 295731192,
      profile,
      winLoss: null,
      savedAt: Date.now(),
    }))
    localStorage.setItem('dotascope.population.v1', JSON.stringify('ranked'))
  }, { profile })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })

  await page.goto(`${BASE}/#/players/295731192`)
  await page.waitForTimeout(12000)
  await page.screenshot({ path: 'screenshots/player-mode-ranked.png', fullPage: false })
  const ranked = await page.evaluate(() => ({
    title: document.title,
    heroRows: document.querySelectorAll('.hero-pool-table tbody tr').length,
    kpis: [...document.querySelectorAll('.kpi-card')].map((el) => el.innerText.replace(/\n/g, ' | ')),
    mode: document.querySelector('.topbar-mode .is-active')?.textContent?.trim(),
    review: Boolean(document.querySelector('.performance-review')),
    reviewNote: Boolean(document.querySelector('.mode-note-panel')),
    body: document.body.innerText.slice(0, 200),
  }))

  const turboButton = page.locator('.topbar-mode-btn', { hasText: 'Turbo' })
  await turboButton.click()
  await page.waitForTimeout(10000)
  await page.screenshot({ path: 'screenshots/player-mode-turbo.png', fullPage: false })
  const turbo = await page.evaluate(() => ({
    heroRows: document.querySelectorAll('.hero-pool-table tbody tr').length,
    kpis: [...document.querySelectorAll('.kpi-card')].map((el) => el.innerText.replace(/\n/g, ' | ')),
    mode: document.querySelector('.topbar-mode .is-active')?.textContent?.trim(),
    review: Boolean(document.querySelector('.performance-review')),
    reviewNote: Boolean(document.querySelector('.mode-note-panel')),
    heroHint: document.querySelector('.hero-pool-table')?.closest('.panel')?.innerText.slice(0, 260),
  }))

  await page.goto(`${BASE}/#/players/295731192/heroes/40`)
  await page.waitForTimeout(10000)
  await page.screenshot({ path: 'screenshots/player-hero-mode-turbo.png', fullPage: false })
  const heroTurbo = await page.evaluate(() => ({
    mode: document.querySelector('.topbar-mode .is-active')?.textContent?.trim(),
    stats: [...document.querySelectorAll('.kpi-card')].map((el) => el.innerText.replace(/\n/g, ' | ')),
    historyRows: document.querySelectorAll('.history-table tbody tr').length,
    body: document.body.innerText.slice(0, 300),
    tables: document.querySelectorAll('table').length,
  }))

  await page.goto(`${BASE}/#/matches`)
  await page.waitForTimeout(3000)
  const myTab = page.getByRole('button', { name: /My matches/ })
  await myTab.click()
  await page.waitForTimeout(10000)
  await page.screenshot({ path: 'screenshots/matches-my-turbo.png', fullPage: false })
  const myTurbo = await page.evaluate(() => ({
    mode: document.querySelector('.topbar-mode .is-active')?.textContent?.trim(),
    cards: document.querySelectorAll('.my-match-card').length,
    summary: [...document.querySelectorAll('.feed-summary-item')].map((el) => el.innerText.replace(/\n/g, ' | ')),
    filter: document.querySelector('.filter-mode-note')?.innerText,
    body: document.body.innerText.slice(0, 300),
  }))

  await page.locator('.topbar-mode-btn', { hasText: 'Ranked' }).click()
  await page.waitForTimeout(8000)
  await page.screenshot({ path: 'screenshots/matches-my-ranked.png', fullPage: false })
  const myRanked = await page.evaluate(() => ({
    mode: document.querySelector('.topbar-mode .is-active')?.textContent?.trim(),
    cards: document.querySelectorAll('.my-match-card').length,
    summary: [...document.querySelectorAll('.feed-summary-item')].map((el) => el.innerText.replace(/\n/g, ' | ')),
    body: document.body.innerText.slice(0, 300),
  }))

  console.log(JSON.stringify({ ranked, turbo, heroTurbo, myTurbo, myRanked, errors }, null, 2))
  await browser.close()
}
run().catch((error) => { console.error(error); process.exit(1) })
