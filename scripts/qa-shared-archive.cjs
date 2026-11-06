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
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, screen: { width: 1440, height: 1100 }, deviceScaleFactor: 1 })
  await context.addInitScript((stored) => localStorage.setItem('dotascope.profile.v1', JSON.stringify(stored)), profile)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })

  await page.goto(`${BASE}/#/matches/9077789924`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.match-detail-page', { timeout: 20000 })
  await page.waitForTimeout(8000)
  const localSource = await page.locator('.badge-local, .badge-shared').first().innerText().catch(() => 'none')
  const localPanel = await page.locator('.local-parse-panel, .shared-parse-panel').count()
  await page.screenshot({ path: 'screenshots/shared-local-match.png' })

  // Force the local worker out of the picture so the page takes the archive path.
  await page.route('http://127.0.0.1:5601/stats/**', (route) => route.abort())
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.match-detail-page', { timeout: 20000 })
  await page.waitForTimeout(9000)
  const sharedSource = await page.locator('.badge-shared').first().innerText().catch(() => 'none')
  const sharedPanel = await page.locator('.shared-parse-panel').count()
  const wardMap = await page.locator('.ward-map-panel').count()
  const rows = await page.locator('.scoreboard-panel tbody tr').count()
  const pageErrors = errors.slice()
  await page.locator('.shared-parse-panel').scrollIntoViewIfNeeded().catch(() => {})
  await page.screenshot({ path: 'screenshots/shared-fallback-match.png' })

  await page.goto(`${BASE}/#/parser`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.parser-share', { timeout: 20000 })
  await page.waitForTimeout(3000)
  const before = await page.evaluate(() => localStorage.getItem('dotascope.sharedArchiveOptIn'))
  await page.locator('.parser-share-toggle').click()
  await page.waitForTimeout(500)
  const after = await page.evaluate(() => localStorage.getItem('dotascope.sharedArchiveOptIn'))
  const shareText = await page.locator('.parser-share').innerText()
  await page.screenshot({ path: 'screenshots/shared-parser-toggle.png' })

  await browser.close()
  console.log(JSON.stringify({ localSource, localPanel, sharedSource, sharedPanel, wardMap, rows, before, after, shareText, errors: pageErrors }, null, 2))
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
