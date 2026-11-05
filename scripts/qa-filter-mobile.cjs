const { chromium } = require('playwright-core')
const fs = require('fs')
const profile = JSON.parse(fs.readFileSync('.tmp-player.json', 'utf8'))
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://localhost:4177'
async function run() {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME })
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true })
  await context.addInitScript(({ profile }) => {
    localStorage.setItem('dotascope.profile.v1', JSON.stringify({ accountId: 295731192, profile, winLoss: null, savedAt: Date.now() }))
    localStorage.setItem('dotascope.population.v1', JSON.stringify('turbo'))
  }, { profile })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto(`${BASE}/#/matches`)
  await page.waitForTimeout(2500)
  await page.getByRole('button', { name: /My matches/ }).click()
  await page.waitForTimeout(10000)
  await page.screenshot({ path: 'screenshots/matches-my-mobile-turbo.png', fullPage: false })
  const turbo = await page.evaluate(() => ({
    innerWidth, scrollWidth: document.body.scrollWidth,
    cards: document.querySelectorAll('.my-match-card').length,
    tabs: [...document.querySelectorAll('.feed-tab')].map((el) => el.innerText.replace(/\n/g, ' | ')),
    summary: [...document.querySelectorAll('.feed-summary-item')].map((el) => el.innerText.replace(/\n/g, ' | ')),
    mode: document.querySelector('.topbar-mode .is-active')?.textContent?.trim(),
    topbar: (() => { const r = document.querySelector('.topbar-actions')?.getBoundingClientRect(); return r ? {left:r.left,right:r.right,width:r.width} : null })(),
  }))
  await page.locator('.topbar-mode-btn', { hasText: 'Ranked' }).click()
  await page.waitForTimeout(8000)
  await page.screenshot({ path: 'screenshots/matches-my-mobile-ranked.png', fullPage: false })
  const ranked = await page.evaluate(() => ({
    innerWidth, scrollWidth: document.body.scrollWidth,
    cards: document.querySelectorAll('.my-match-card').length,
    summary: [...document.querySelectorAll('.feed-summary-item')].map((el) => el.innerText.replace(/\n/g, ' | ')),
    mode: document.querySelector('.topbar-mode .is-active')?.textContent?.trim(),
  }))
  await page.goto(`${BASE}/#/players/295731192/heroes/35`)
  await page.waitForTimeout(10000)
  await page.screenshot({ path: 'screenshots/hero-mode-mobile-ranked.png', fullPage: false })
  const hero = await page.evaluate(() => ({
    innerWidth, scrollWidth: document.body.scrollWidth,
    mode: document.querySelector('.topbar-mode .is-active')?.textContent?.trim(),
    kpis: [...document.querySelectorAll('.kpi-card')].map((el) => el.innerText.replace(/\n/g, ' | ')),
    rows: document.querySelectorAll('tbody tr').length,
  }))
  console.log(JSON.stringify({ turbo, ranked, hero, errors }, null, 2))
  await browser.close()
}
run().catch((e) => { console.error(e); process.exit(1) })
