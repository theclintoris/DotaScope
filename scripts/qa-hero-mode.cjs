const { chromium } = require('playwright-core')
const fs = require('fs')
const profile = JSON.parse(fs.readFileSync('.tmp-player.json', 'utf8'))
const BASE = 'http://localhost:4177'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
async function run() {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
  await context.addInitScript(({ profile }) => {
    localStorage.setItem('dotascope.profile.v1', JSON.stringify({ accountId: 295731192, profile, winLoss: null, savedAt: Date.now() }))
    localStorage.setItem('dotascope.population.v1', JSON.stringify('turbo'))
  }, { profile })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto(`${BASE}/#/players/295731192/heroes/35`)
  await page.waitForTimeout(12000)
  await page.screenshot({ path: 'screenshots/hero-mode-turbo.png', fullPage: false })
  const turbo = await page.evaluate(() => ({
    mode: document.querySelector('.topbar-mode .is-active')?.textContent?.trim(),
    kpis: [...document.querySelectorAll('.kpi-card')].map((el) => el.innerText.replace(/\n/g, ' | ')),
    tables: document.querySelectorAll('table').length,
    rows: document.querySelectorAll('tbody tr').length,
    body: document.body.innerText.slice(0, 500),
  }))
  await page.locator('.topbar-mode-btn', { hasText: 'Ranked' }).click()
  await page.waitForTimeout(10000)
  await page.screenshot({ path: 'screenshots/hero-mode-ranked.png', fullPage: false })
  const ranked = await page.evaluate(() => ({
    mode: document.querySelector('.topbar-mode .is-active')?.textContent?.trim(),
    kpis: [...document.querySelectorAll('.kpi-card')].map((el) => el.innerText.replace(/\n/g, ' | ')),
    tables: document.querySelectorAll('table').length,
    rows: document.querySelectorAll('tbody tr').length,
    body: document.body.innerText.slice(0, 500),
  }))
  console.log(JSON.stringify({ turbo, ranked, errors }, null, 2))
  await browser.close()
}
run().catch((e) => { console.error(e); process.exit(1) })
