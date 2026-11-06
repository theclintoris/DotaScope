const { chromium } = require('playwright-core')

const BASE = 'http://localhost:4182'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const profile = {
  accountId: 295731192,
  profile: { profile: { account_id: 295731192, personaname: 'Lemongrab', name: null, avatarfull: '', profileurl: '', last_login: null, loccountrycode: 'NZ', is_contributor: false, is_subscriber: false }, rank_tier: 34, leaderboard_rank: null, computed_mmr: 3864, computed_mmr_turbo: 4037 },
  winLoss: null,
  savedAt: Date.now(),
}

async function run() {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME })
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, screen: { width: 412, height: 915 }, deviceScaleFactor: 1, isMobile: true })
  await context.addInitScript((stored) => localStorage.setItem('dotascope.profile.v1', JSON.stringify(stored)), profile)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })
  await page.route('http://127.0.0.1:5601/stats/**', (route) => route.abort())
  await page.goto(`${BASE}/#/matches/9077789924?runtime=desktop`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.badge-shared', { timeout: 20000 })
  await page.waitForTimeout(1500)
  const sharedPanel = await page.locator('.shared-parse-panel').count()
  const ward = await page.locator('.ward-map').count()
  const source = await page.locator('.badge-shared').first().innerText()
  const layout = await page.evaluate(() => ({ innerWidth: window.innerWidth, scrollWidth: document.body.scrollWidth }))
  await page.locator('.shared-parse-panel').scrollIntoViewIfNeeded().catch(() => {})
  await page.screenshot({ path: 'screenshots/shared-fallback-mobile.png' })
  await page.goto(`${BASE}/#/parser?runtime=desktop`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.parser-share', { timeout: 15000 })
  await page.evaluate(() => localStorage.setItem('dotascope.sharedArchiveOptIn', '1'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.parser-share', { timeout: 15000 })
  await page.waitForTimeout(2500)
  const shareText = await page.locator('.parser-share').innerText().catch(() => 'none')
  const layout2 = await page.evaluate(() => ({ innerWidth: window.innerWidth, scrollWidth: document.body.scrollWidth }))
  await page.screenshot({ path: 'screenshots/shared-parser-mobile-final.png' })
  console.log(JSON.stringify({ source, sharedPanel, ward, layout, shareText, layout2, errors: errors.filter((error) => !error.includes('ERR_FAILED')) }, null, 2))
  await browser.close()
}

run().catch((error) => { console.error(error); process.exit(1) })
