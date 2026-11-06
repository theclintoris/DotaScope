const { chromium } = require('playwright-core')

const BASE = 'http://localhost:4182/?runtime=desktop'
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
  await context.addInitScript((stored) => {
    localStorage.setItem('dotascope.profile.v1', JSON.stringify(stored))
    localStorage.setItem('dotascope.sharedArchiveOptIn', '1')
  }, profile)
  const page = await context.newPage()
  const errors = []
  const uploads = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('dotascope-shared.dotascope.workers.dev/v1/matches')) {
      uploads.push({ url: request.url(), body: request.postData() })
    }
  })
  await page.goto(`${BASE}#/records`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(18000)
  const toast = await page.locator('.auto-parse-toast').innerText().catch(() => 'none')
  const toastClass = await page.locator('.auto-parse-toast').getAttribute('class').catch(() => 'none')
  await page.screenshot({ path: 'screenshots/shared-auto-upload.png' })
  const parsed = uploads.map((entry) => {
    let payload = null
    try { payload = JSON.parse(entry.body) } catch {}
    const players = payload?.match?.players ?? []
    return {
      players: players.length,
      nameLeaks: players.filter((player) => 'personaname' in player || 'steamId' in player || 'steam_id' in player).length,
      timeline: payload?.match?.timeline?.length ?? 0,
      wards: payload?.match?.wards?.length ?? 0,
      matchId: payload?.match?.match?.matchId ?? payload?.match?.matchId ?? null,
    }
  })
  await browser.close()
  console.log(JSON.stringify({ toast, toastClass, uploads: parsed, errors }, null, 2))
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
