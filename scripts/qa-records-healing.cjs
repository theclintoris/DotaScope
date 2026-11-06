const { chromium } = require('playwright-core')
const fs = require('fs')

const BASE = process.env.APP_URL || 'http://127.0.0.1:4181'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const profile = {
  accountId: 295731192,
  profile: { profile: { account_id: 295731192, personaname: 'Lemongrab', name: null, avatarfull: '', profileurl: '', last_login: null, loccountrycode: 'NZ', is_contributor: false, is_subscriber: false }, rank_tier: 34, leaderboard_rank: null, computed_mmr: 3864, computed_mmr_turbo: 4037 },
  winLoss: null,
  savedAt: Date.now(),
}

async function readCards(page) {
  return page.evaluate(() => [...document.querySelectorAll('.personal-record-card')].map((card) => ({
    label: card.querySelector('.personal-record-card-head span:nth-child(2)')?.textContent?.trim(),
    value: card.querySelector('strong')?.textContent?.trim(),
    meta: card.querySelector('.personal-record-meta span')?.textContent?.trim(),
  })))
}

async function run(viewport, name) {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME })
  const context = await browser.newContext({ viewport, screen: viewport, deviceScaleFactor: 1 })
  await context.addInitScript((stored) => localStorage.setItem('dotascope.profile.v1', JSON.stringify(stored)), profile)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })
  await page.goto(`${BASE}/#/records`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.personal-records', { timeout: 15000 })
  await page.waitForTimeout(5000)
  const ranked = await readCards(page)
  await page.locator('.personal-records').scrollIntoViewIfNeeded().catch(() => {})
  await page.screenshot({ path: `screenshots/records-healing-ranked-${name}.png`, fullPage: false })

  await page.locator('.topbar-mode-btn', { hasText: 'Turbo' }).click()
  await page.waitForTimeout(5000)
  const turbo = await readCards(page)
  await page.locator('.personal-records').scrollIntoViewIfNeeded().catch(() => {})
  await page.screenshot({ path: `screenshots/records-healing-turbo-${name}.png`, fullPage: false })
  await page.screenshot({ path: `screenshots/records-healing-turbo-${name}-full.png`, fullPage: true })

  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    cards: document.querySelectorAll('.personal-record-card').length,
  }))
  await browser.close()
  return { ranked, turbo, layout, errors }
}

async function main() {
  const desktop = await run({ width: 1440, height: 1100 }, 'desktop')
  const mobile = await run({ width: 412, height: 915 }, 'mobile')
  const result = { desktop, mobile }
  fs.writeFileSync('screenshots/records-healing-qa.json', JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => { console.error(error); process.exit(1) })
